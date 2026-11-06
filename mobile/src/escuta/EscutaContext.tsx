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
import { gerenciadorFala, type ItemFala } from "../services/gerenciadorFala";
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
  concluirPergunta: () => Promise<void>;
  cancelarModoEscuta: () => void;
  aoChamar: (cb: OuvinteChamada) => () => void;
};

const VALOR_PADRAO: Valor = {
  estado: "desligada",
  ativa: false,
  permissaoNegada: false,
  ouvindoPergunta: false,
  alternar: async () => {},
  perguntarAgora: async () => {},
  concluirPergunta: async () => {},
  cancelarModoEscuta: () => {},
  aoChamar: () => () => {},
};

const Contexto = createContext<Valor>(VALOR_PADRAO);

const MSG_INDISPONIVEL = "O reconhecimento de voz não está disponível neste aparelho.";
const TEMPO_ALARME_FALSO_MS = 3000;
const TEMPO_MAX_MODO_ESCUTA_MS = 45_000;

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
  const timerAlarmeFalso = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerSegurancaModo = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geracaoModo = useRef(0);

  const limparTimersModo = useCallback(() => {
    if (timerAlarmeFalso.current) clearTimeout(timerAlarmeFalso.current);
    if (timerSegurancaModo.current) clearTimeout(timerSegurancaModo.current);
    timerAlarmeFalso.current = null;
    timerSegurancaModo.current = null;
  }, []);

  const sairModoEscuta = useCallback(async () => {
    limparTimersModo();
    geracaoModo.current += 1;
    motorEscuta.cancelarColetaPergunta();
    motorEscuta.cancelarAtivacaoPendente();
    setOuvindoPergunta(false);
    await motorEscuta.pausar();
    const informativaRetida = gerenciadorFala.sairModoEscuta(() => {
      void motorEscuta.retomar();
    });
    if (!informativaRetida) await motorEscuta.retomar();
  }, [limparTimersModo]);

  const cancelarModoEscuta = useCallback(() => {
    limparTimersModo();
    geracaoModo.current += 1;
    motorEscuta.cancelarColetaPergunta();
    motorEscuta.cancelarAtivacaoPendente();
    setOuvindoPergunta(false);
    gerenciadorFala.calar();
  }, [limparTimersModo]);

  const entrarModoEscuta = useCallback(
    (possivelAtivacao = false) => {
      if (!gerenciadorFala.emModoEscuta) {
        geracaoModo.current += 1;
        const geracao = geracaoModo.current;
        gerenciadorFala.entrarModoEscuta();
        setOuvindoPergunta(true);
        timerSegurancaModo.current = setTimeout(() => {
          if (geracao !== geracaoModo.current) return;
          void sairModoEscuta();
        }, TEMPO_MAX_MODO_ESCUTA_MS);
      }

      if (possivelAtivacao) {
        if (timerAlarmeFalso.current) clearTimeout(timerAlarmeFalso.current);
        const geracao = geracaoModo.current;
        timerAlarmeFalso.current = setTimeout(() => {
          timerAlarmeFalso.current = null;
          if (geracao !== geracaoModo.current) return;
          if (typeof __DEV__ !== "undefined" && __DEV__) {
            console.info("[VOSK-AVAL] possivel_ativacao_nao_confirmada");
          }
          void sairModoEscuta();
        }, TEMPO_ALARME_FALSO_MS);
      } else if (timerAlarmeFalso.current) {
        clearTimeout(timerAlarmeFalso.current);
        timerAlarmeFalso.current = null;
      }
    },
    [sairModoEscuta],
  );

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

    const tratarRiscoDuranteEscuta = (item: ItemFala) => {
      const geracao = geracaoModo.current;
      motorEscuta.cancelarColetaPergunta();
      setOuvindoPergunta(false);
      void motorEscuta.pausar().then(() => {
        if (!gerenciadorFala.emModoEscuta || geracao !== geracaoModo.current) {
          gerenciadorFala.falarPrioritariaDuranteEscuta(item);
          return;
        }
        const risco = item.motivo === "RISCO";
        gerenciadorFala.falarPrioritariaDuranteEscuta({
          ...item,
          aoTerminar: risco
            ? () => {
              if (!gerenciadorFala.emModoEscuta || geracao !== geracaoModo.current) return;
              setOuvindoPergunta(true);
              void dizer("Pode perguntar.").then(async (terminou) => {
                if (terminou && gerenciadorFala.emModoEscuta && geracao === geracaoModo.current) {
                  await motorEscuta.iniciarColetaPergunta();
                }
              });
            }
            : () => void sairModoEscuta(),
        });
      });
    };

    gerenciadorFala.definirTratadorRiscoDuranteEscuta(tratarRiscoDuranteEscuta);
    motorEscuta.definirEventos({
      aoPossivelAtivacao: () => entrarModoEscuta(true),
      aoDetectarAtivacao: async (perguntaImediata) => {
        entrarModoEscuta(false);
        const geracao = geracaoModo.current;
        if (perguntaImediata) {
          vibrar.sucesso();
          await motorEscuta.pausar();
          if (geracao !== geracaoModo.current) return;
          assinantes.current.forEach((cb) => cb(perguntaImediata));
          encerrarTemporario();
        } else {
          vibrar.confirmar();
          setOuvindoPergunta(true);
          const terminou = await dizer("Pode perguntar.");
          if (terminou && gerenciadorFala.emModoEscuta && geracao === geracaoModo.current) {
            await motorEscuta.iniciarColetaPergunta();
          }
        }
      },
      aoPerguntaPronta: async (pergunta) => {
        vibrar.sucesso();
        setOuvindoPergunta(false);
        await motorEscuta.pausar();
        assinantes.current.forEach((cb) => cb(pergunta));
        encerrarTemporario();
      },
      aoExpirar: async () => {
        await motorEscuta.pausar();
        if (!gerenciadorFala.emModoEscuta) return;
        setOuvindoPergunta(false);
        gerenciadorFala.enfileirar({
          texto: "Não ouvi a pergunta.",
          prioridade: 2,
          interrompe: false,
          expiraEmMs: 6000,
          aoTerminar: () => void sairModoEscuta(),
          aoInterromper: () => {
            if (!gerenciadorFala.emModoEscuta) void motorEscuta.retomar();
          },
        });
        encerrarTemporario();
      },
      aoErro: (mensagem) => {
        console.log("ERRO NA ESCUTA:", mensagem);
        setOuvindoPergunta(false);
        if (gerenciadorFala.emModoEscuta) void sairModoEscuta();
      },
    });

    return () => {
      motorEscuta.definirEventos(null);
      gerenciadorFala.definirTratadorRiscoDuranteEscuta(null);
      limparTimersModo();
      motorEscuta.liberar();
    };
  }, [entrarModoEscuta, limparTimersModo, pararMotor, sairModoEscuta]);

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
        cancelarModoEscuta();
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
  }, [cancelarModoEscuta, config.escutaAtiva, iniciarMotor, pararMotor]);

  const alternar = useCallback(async () => {
    if (obterConfig().escutaAtiva) {
      atualizar({ escutaAtiva: false });
      cancelarModoEscuta();
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
  }, [atualizar, cancelarModoEscuta]);

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

    entrarModoEscuta(false);
    vibrar.confirmar();
    setOuvindoPergunta(true);
    const geracao = geracaoModo.current;
    const terminou = await dizer("Pode perguntar.");
    if (terminou && gerenciadorFala.emModoEscuta && geracao === geracaoModo.current) {
      await motorEscuta.perguntarAgora();
    }
  }, [entrarModoEscuta, iniciarMotor]);

  const concluirPergunta = useCallback(async () => {
    await sairModoEscuta();
  }, [sairModoEscuta]);

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
      concluirPergunta,
      cancelarModoEscuta,
      aoChamar,
    }),
    [estado, config.escutaAtiva, permissaoNegada, ouvindoPergunta, alternar, perguntarAgora, concluirPergunta, cancelarModoEscuta, aoChamar],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useEscuta(): Valor {
  const valor = useContext(Contexto);
  return valor ?? VALOR_PADRAO;
}
