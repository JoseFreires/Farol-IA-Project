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
import { AppState, type AppStateStatus, PermissionsAndroid, Platform } from "react-native";

import { escutaDisponivel, motorEscuta } from "../services/escuta";
import { dizer } from "../services/dialogo";
import { gerenciadorFala } from "../services/gerenciadorFala";
import { vibrar } from "../services/vibracao";
import { obterConfig } from "../settings/atual";
import { useConfig } from "../settings/ConfiguracoesContext";

export type EstadoEscuta = "desligada" | "iniciando" | "ouvindo" | "erro";
type OuvinteChamada = (pergunta: string) => void;

type Valor = {
  estado: EstadoEscuta;
  ativa: boolean;
  permissaoNegada: boolean;
  ouvindoPergunta: boolean;
  alternar: () => Promise<void>;
  perguntarAgora: () => Promise<void>;
  aoChamar: (cb: OuvinteChamada) => () => void;
};

const VALOR_PADRAO: Valor = {
  estado: "desligada",
  ativa: false,
  permissaoNegada: false,
  ouvindoPergunta: false,
  alternar: async () => {},
  perguntarAgora: async () => {},
  aoChamar: () => () => {},
};

const Contexto = createContext<Valor>(VALOR_PADRAO);

const MSG_INDISPONIVEL = "O reconhecimento de voz não está disponível neste aparelho.";

export async function verificarPermissaoMicrofone(): Promise<boolean> {
  if (Platform.OS === "android") {
    try {
      const tem = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (tem) return true;
    } catch {
      // fallback para expo-audio
    }
  }
  try {
    const permissao = await getRecordingPermissionsAsync();
    return permissao.granted;
  } catch {
    return false;
  }
}

export async function garantirPermissao(): Promise<boolean> {
  const jaTem = await verificarPermissaoMicrofone();
  if (jaTem) return true;

  if (Platform.OS === "android") {
    try {
      gerenciadorFala.falarInstrucao("O Farol vai usar o microfone para ouvir você. Permita no próximo aviso.");
      const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (res === PermissionsAndroid.RESULTS.GRANTED) return true;
    } catch {
      // fallback para expo-audio
    }
  }

  try {
    let permissao = await getRecordingPermissionsAsync();
    if (!permissao.granted && permissao.canAskAgain) {
      permissao = await requestRecordingPermissionsAsync();
    }
    return permissao.granted;
  } catch {
    return false;
  }
}

export function EscutaProvider({ children }: { children: ReactNode }) {
  const { config, atualizar } = useConfig();
  const [estado, setEstado] = useState<EstadoEscuta>("desligada");
  const [permissaoNegada, setPermissaoNegada] = useState(false);
  const [ouvindoPergunta, setOuvindoPergunta] = useState(false);

  const assinantes = useRef(new Set<OuvinteChamada>());
  const temporario = useRef(false);
  const voltarAoRetomar = useRef(false);

  const iniciarMotor = useCallback(async () => {
    if (!escutaDisponivel) {
      setEstado("erro");
      gerenciadorFala.falarInstrucao(MSG_INDISPONIVEL, false);
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
      gerenciadorFala.falarInstrucao("Não consegui ligar o assistente de voz.", false);
    }
  }, []);

  const pararMotor = useCallback(async () => {
    await motorEscuta.parar();
    setEstado("desligada");
    setOuvindoPergunta(false);
  }, []);

  // Liga os eventos do motor de escuta
  useEffect(() => {
    const encerrarTemporario = () => {
      setOuvindoPergunta(false);
      if (temporario.current) {
        temporario.current = false;
        pararMotor();
      }
    };

    motorEscuta.definirEventos({
      aoDetectarAtivacao: async (perguntaImediata) => {
        if (perguntaImediata) {
          // Já veio a pergunta na mesma frase: envia direto
          vibrar.sucesso();
          gerenciadorFala.interromperInformativas();
          assinantes.current.forEach((cb) => cb(perguntaImediata));
          encerrarTemporario();
        } else {
          // Palavra "Farol" dita sozinha: interrompe descrição, pede a pergunta e só abre o mic após terminar de falar
          vibrar.confirmar();
          gerenciadorFala.interromperInformativas();
          setOuvindoPergunta(true);
          await dizer("Pode perguntar.");
          motorEscuta.iniciarColetaPergunta();
        }
      },
      aoPerguntaPronta: (pergunta) => {
        vibrar.sucesso();
        setOuvindoPergunta(false);
        assinantes.current.forEach((cb) => cb(pergunta));
        encerrarTemporario();
      },
      aoExpirar: () => {
        setOuvindoPergunta(false);
        gerenciadorFala.falarInstrucao("Não ouvi a pergunta.", false);
        encerrarTemporario();
      },
      aoErro: (mensagem) => {
        console.log("ERRO NA ESCUTA:", mensagem);
        setOuvindoPergunta(false);
      },
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
        const temPermissao = await verificarPermissaoMicrofone();
        if (!vivo) return;
        if (temPermissao) {
          setPermissaoNegada(false);
          temporario.current = false;
          await iniciarMotor();
        } else {
          // Tenta solicitar permissão se ainda não foi pedida
          const concedeu = await garantirPermissao();
          if (!vivo) return;
          if (concedeu) {
            setPermissaoNegada(false);
            temporario.current = false;
            await iniciarMotor();
          } else {
            setPermissaoNegada(true);
          }
        }
      } else if (!temporario.current) {
        await pararMotor();
      }
    })();
    return () => {
      vivo = false;
    };
  }, [config.escutaAtiva, iniciarMotor, pararMotor]);

  // Desliga em segundo plano e religa ao voltar (inclusive após o usuário conceder permissão nas configurações do sistema)
  useEffect(() => {
    const assinatura = AppState.addEventListener("change", async (situacao: AppStateStatus) => {
      if (situacao === "background") {
        if (temporario.current) temporario.current = false;
        else if (motorEscuta.estaRodando()) voltarAoRetomar.current = true;
        if (motorEscuta.estaRodando()) pararMotor();
      } else if (situacao === "active") {
        const temPermissao = await verificarPermissaoMicrofone();
        if (temPermissao) {
          setPermissaoNegada(false);
        }
        if (config.escutaAtiva && temPermissao && !motorEscuta.estaRodando()) {
          voltarAoRetomar.current = false;
          await iniciarMotor();
        } else if (voltarAoRetomar.current && temPermissao) {
          voltarAoRetomar.current = false;
          await iniciarMotor();
        }
      }
    });
    return () => assinatura.remove();
  }, [config.escutaAtiva, iniciarMotor, pararMotor]);

  const alternar = useCallback(async () => {
    if (obterConfig().escutaAtiva) {
      atualizar({ escutaAtiva: false });
      gerenciadorFala.calar();
      gerenciadorFala.falarInstrucao("Assistente de voz desligado.", true);
      return;
    }
    if (!escutaDisponivel) {
      gerenciadorFala.falarInstrucao(MSG_INDISPONIVEL, false);
      return;
    }
    const ok = await garantirPermissao();
    setPermissaoNegada(!ok);
    if (!ok) {
      vibrar.erro();
      gerenciadorFala.falarInstrucao(
        "Sem a permissão do microfone o assistente não funciona. Você pode permitir nos ajustes do aparelho.",
        false
      );
      return;
    }
    atualizar({ escutaAtiva: true });
    gerenciadorFala.falarInstrucao("Assistente de voz ligado. Diga Farol para fazer uma pergunta.", true);
  }, [atualizar]);

  const perguntarAgora = useCallback(async () => {
    if (!escutaDisponivel) {
      gerenciadorFala.falarInstrucao(MSG_INDISPONIVEL, false);
      return;
    }
    if (!motorEscuta.estaRodando()) {
      const ok = await garantirPermissao();
      setPermissaoNegada(!ok);
      if (!ok) {
        gerenciadorFala.falarInstrucao("Preciso da permissão do microfone para ouvir sua pergunta.", false);
        return;
      }
      temporario.current = !obterConfig().escutaAtiva;
      await iniciarMotor();
      if (!motorEscuta.estaRodando()) {
        temporario.current = false;
        return;
      }
    }

    vibrar.confirmar();
    gerenciadorFala.interromperInformativas();
    setOuvindoPergunta(true);
    await dizer("Pode perguntar.");
    motorEscuta.perguntarAgora();
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
      ouvindoPergunta,
      alternar,
      perguntarAgora,
      aoChamar,
    }),
    [estado, config.escutaAtiva, permissaoNegada, ouvindoPergunta, alternar, perguntarAgora, aoChamar],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useEscuta(): Valor {
  const valor = useContext(Contexto);
  return valor ?? VALOR_PADRAO;
}
