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

import { calar, dizer } from "../services/dialogo";
import { escutaDisponivel, motorEscuta } from "../services/escuta";
import { falar } from "../services/fala";
import { vibrar } from "../services/vibracao";
import { obterConfig } from "../settings/atual";
import { useConfig } from "../settings/ConfiguracoesContext";

export type EstadoEscuta = "desligada" | "iniciando" | "ouvindo" | "erro";
type OuvinteChamada = (pergunta?: string) => void;

type Valor = {
  estado: EstadoEscuta;
  ativa: boolean; // preferência da pessoa: assistente ligado
  permissaoNegada: boolean;
  alternar: () => Promise<void>; // liga/desliga o assistente (pede o microfone se preciso)
  perguntarAgora: () => Promise<void>; // botão "Ditar": a próxima frase falada é a pergunta
  aoChamar: (cb: OuvinteChamada) => () => void; // "Farol" ouvido; devolve a função de cancelar
};

const Contexto = createContext<Valor | null>(null);

const MSG_INDISPONIVEL = "O reconhecimento de voz não está disponível neste aparelho.";

async function garantirPermissao(): Promise<boolean> {
  let permissao = await getRecordingPermissionsAsync();
  if (!permissao.granted && permissao.canAskAgain) {
    falar("O Farol vai usar o microfone para ouvir você. Permita no próximo aviso.");
    permissao = await requestRecordingPermissionsAsync();
  }
  return permissao.granted;
}

export function EscutaProvider({ children }: { children: ReactNode }) {
  const { config, atualizar } = useConfig();
  const [estado, setEstado] = useState<EstadoEscuta>("desligada");
  const [permissaoNegada, setPermissaoNegada] = useState(false);

  const assinantes = useRef(new Set<OuvinteChamada>());
  const temporario = useRef(false); // microfone ligado só para uma pergunta ditada
  const voltarAoRetomar = useRef(false); // religar ao voltar do segundo plano

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

  // Liga os eventos do motor de escuta aos assinantes (menu, câmera...)
  useEffect(() => {
    const encerrarTemporario = () => {
      if (temporario.current) {
        temporario.current = false;
        pararMotor();
      }
    };

    motorEscuta.definirEventos({
      aoChamar: (pergunta) => {
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

  // Segue a preferência "assistente ligado"
  useEffect(() => {
    let vivo = true;
    (async () => {
      if (config.escutaAtiva) {
        const permissao = await getRecordingPermissionsAsync();
        if (!vivo) return;
        if (!permissao.granted) {
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

  // A escuta só funciona com o app aberto: desliga em segundo plano e religa ao voltar
  useEffect(() => {
    const assinatura = AppState.addEventListener("change", (situacao: AppStateStatus) => {
      if (situacao === "background") {
        if (temporario.current) temporario.current = false;
        else if (motorEscuta.estaRodando()) voltarAoRetomar.current = true;
        if (motorEscuta.estaRodando()) pararMotor();
      } else if (situacao === "active" && voltarAoRetomar.current) {
        voltarAoRetomar.current = false;
        iniciarMotor();
      }
    });
    return () => assinatura.remove();
  }, [iniciarMotor, pararMotor]);

  const alternar = useCallback(async () => {
    if (obterConfig().escutaAtiva) {
      atualizar({ escutaAtiva: false });
      calar();
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
    dizer("Assistente de voz ligado. Diga Farol para descrever o que está à sua frente.");
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

  const aoChamar = useCallback((cb: OuvinteChamada) => {
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
      perguntarAgora,
      aoChamar,
    }),
    [estado, config.escutaAtiva, permissaoNegada, alternar, perguntarAgora, aoChamar],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useEscuta(): Valor {
  const valor = useContext(Contexto);
  if (!valor) throw new Error("useEscuta deve ser usado dentro do EscutaProvider");
  return valor;
}
