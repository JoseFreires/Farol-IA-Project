import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from "expo-audio";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import { escutaDisponivel, motorEscuta } from "../services/escuta";
import { aguardarFimDaFala, falar } from "../services/fala";
import { vibrar } from "../services/vibracao";
import { obterConfig } from "../settings/atual";
import { useConfig } from "../settings/ConfiguracoesContext";

export type EstadoEscuta = "desligada" | "iniciando" | "ouvindo" | "erro";
type OuvintePergunta = (pergunta: string) => void;

type Valor = {
  estado: EstadoEscuta;
  ativa: boolean; // preferência da pessoa: assistente ligado
  permissaoNegada: boolean;
  alternar: () => Promise<void>; // liga/desliga o assistente (pede o microfone se preciso)
  pausar: () => void; // chame ao começar a falar, para o app não ouvir a si mesmo
  retomar: () => void;
  perguntarAgora: () => Promise<void>; // botão "Perguntar": a próxima frase é a pergunta
  aoReceberPergunta: (cb: OuvintePergunta) => () => void; // devolve a função de cancelar
};


const Contexto= createContext<Valor | null>(null);

const MSG_INDISPONIVEL = "O reconhecimento de voz não está disponível neste aparelho.";

async function garantirPermissao(): Promise<boolean> {
  let p = await getRecordingPermissionsAsync();
  if (!p.granted && p.canAskAgain) {
    falar("O Farol vai usar o microfone para ouvir você. Permita no próximo aviso.");
    p = await requestRecordingPermissionsAsync();
  }
  return p.granted;
}

function falarSemOuvir(texto: string) {
  motorEscuta.pausar();
  falar(texto);
  aguardarFimDaFala().then(() => motorEscuta.retomar());
}


export function EscutaProvider({ children }: { children: ReactNode }) {
  const { config, atualizar } = useConfig();
  const [estado, setEstado] = useState<EstadoEscuta>("desligada");
  const [permissaoNegada, setPermissaoNegada] = useState(false);

  const assinantes = useRef(new Set<OuvintePergunta>());
  const temporario = useRef(false);
   const voltarAoRetomar = useRef(false);

     const iniciarMotor = useCallback(async () => {
    if (!escutaDisponivel) {
      setEstado("erro");
      falar(MSG_INDISPONIVEL);
      return;
    }
    setEstado("iniciando");
     try {
      await motorEscuta.iniciar();
      setEstado("ouvindo");
    } catch (erro) {
      console.log("ERRO AO INICIAR ESCUTA:", erro);
      setEstado("erro");
      vibrar.erro();
      falar("Não consegui ligar o assistente de voz.");
    }
  }, []);

    const pararMotor = useCallback(async () => {
    await motorEscuta.parar();
    setEstado("desligada");
  }, []);

  useEffect(() => {
    const encerrarTemporario = () => {
      if (temporario.current) {
        temporario.current = false;
        pararMotor();
      }
    };

    motorEscuta.definirEventos({
      aoAtivar: () => vibrar.confirmar(), // ouviu "farol": pode falar
      aoReceberPergunta: (pergunta) => {
        vibrar.sucesso();
        assinantes.current.forEach((cb) => cb(pergunta));
        encerrarTemporario();
      },
      aoExpirar: encerrarTemporario,
      aoErro: (mensagem) => console.log("ERRO NA ESCUTA:", mensagem),
    });

    return () => {
      motorEscuta.definirEventos(null);
      motorEscuta.liberar();
    };
  }, [pararMotor]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (config.escutaAtiva) {
        const p = await getRecordingPermissionsAsync();
        if (!vivo) return;
        if (!p.granted) {
          atualizar({ escutaAtiva: false }); // permissão foi revogada nos ajustes do aparelho
          return;
        }
        temporario.current = false;
        await iniciarMotor();
      } else if (!temporario.current) {
        await pararMotor();
      }
    })();
    return () => {
      vivo = false;
    };
  }, [config.escutaAtiva, atualizar, iniciarMotor, pararMotor]);


  //permite a escuta apenas com o app aberto
    useEffect(() => {
    const assinatura = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s === "background") {
        if (temporario.current) temporario.current = false;
        else if (motorEscuta.estaRodando()) voltarAoRetomar.current = true;
        if (motorEscuta.estaRodando()) pararMotor();
      } else if (s === "active" && voltarAoRetomar.current) {
        voltarAoRetomar.current = false;
        iniciarMotor();
      }
    });
    return () => assinatura.remove();
  }, [iniciarMotor, pararMotor]); 


  const alternar = useCallback(async () => {
    if (obterConfig().escutaAtiva) {
      atualizar({ escutaAtiva: false });
      falar("Assistente de voz desligado.");
      return;
    }
    if (!escutaDisponivel) {
      falar(MSG_INDISPONIVEL);
      return;
    }
    const ok = await garantirPermissao();
    setPermissaoNegada(!ok);
    if (!ok) {
      vibrar.erro();
      falar(
        "Sem a permissão do microfone o assistente não funciona. Você pode permitir nos ajustes do aparelho.",
      );
      return;
    }
    atualizar({ escutaAtiva: true });
    falarSemOuvir("Assistente de voz ligado. Diga Farol e faça sua pergunta.");
  }, [atualizar]);

    const perguntarAgora = useCallback(async () => {
    if (!escutaDisponivel) {
      falar(MSG_INDISPONIVEL);
      return;
    }
    if (!motorEscuta.estaRodando()) {
      // Assistente desligado: liga o microfone só para esta pergunta
      const ok = await garantirPermissao();
      setPermissaoNegada(!ok);
      if (!ok) {
        falar("Preciso da permissão do microfone para ouvir sua pergunta.");
        return;
      }
      temporario.current = !obterConfig().escutaAtiva;
      await iniciarMotor();
      if (!motorEscuta.estaRodando()) {
        temporario.current = false;
        return;
      }
    }
    motorEscuta.perguntarAgora();
    vibrar.confirmar(); // sinal de "pode falar"
  }, [iniciarMotor]);

  const pausar = useCallback(() => motorEscuta.pausar(), []);
  const retomar = useCallback(() => motorEscuta.retomar(), []);


    const aoReceberPergunta = useCallback((cb: OuvintePergunta) => {
    assinantes.current.add(cb);
    return () => {
      assinantes.current.delete(cb);
    };
  }, []);

  const valor = useMemo<Valor>(
    () => ({
      estado,
      ativa: config.escutaAtiva,
      permissaoNegada,
      alternar,
      pausar,
      retomar,
      perguntarAgora,
      aoReceberPergunta,
    }),
    [estado, config.escutaAtiva, permissaoNegada, alternar, pausar, retomar, perguntarAgora, aoReceberPergunta],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useEscuta(): Valor {
  const valor = useContext(Contexto);
  if (!valor) throw new Error("useEscuta deve ser usado dentro do EscutaProvider");
  return valor;
}
