import { Platform } from "react-native";

export const MODELO = "model-small-pt-0.3";

const ATIVACAO = /\bfarol\b[\s,.!?:;-]*/;

const TEMPO_PARA_PERGUNTA_MS = 20_000;
const FOLGA_APOS_PAUSA_MS = 800;

type Ouvinte = { remove: () => void };
type VoskNativo = {
  loadModel: (caminho: string) => Promise<unknown>;
  start: (opcoes?: { grammar?: string[]; timeout?: number }) => Promise<unknown>;
  stop: () => unknown;
  unload: () => unknown;
  onResult: (cb: (resultado: unknown) => void) => Ouvinte;
  onError: (cb: (erro: unknown) => void) => Ouvinte;
};
type ClasseVosk = new () => VoskNativo;

let Vosk: ClasseVosk | null = null;
if (Platform.OS !== "web") {
  try {
    const modulo = require("react-native-vosk");
    Vosk = (modulo.default ?? modulo.Vosk ?? null) as ClasseVosk | null;
  } catch {
    Vosk = null;
  }
}

export const escutaDisponivel = Vosk !== null;

export type EventosEscuta = {
  aoAtivar: () => void; // ouviu só "farol": a pergunta vem a seguir
  aoReceberPergunta: (pergunta: string) => void;
  aoExpirar: () => void; // ouviu "farol", mas ninguém perguntou nada
  aoErro: (mensagem: string) => void;
};

function extrairTexto(bruto: unknown): string {
  if (typeof bruto === "string") {
    const t = bruto.trim();
    if (t.startsWith("{")) {
      try {
        const obj = JSON.parse(t) as { text?: unknown };
        return typeof obj.text === "string" ? obj.text.trim() : "";
      } catch {
        return t;
      }
    }
    return t;
  }
  if (bruto && typeof bruto === "object" && "text" in bruto) {
    const texto = (bruto as { text: unknown }).text;
    return typeof texto === "string" ? texto.trim() : "";
  }
  return "";
}

export function criarMotorEscuta() {
  let vosk: VoskNativo | null = null;
  let modeloPronto = false;
  let ouvintes: Ouvinte[] = [];
  let rodando = false;
  let emInicio: Promise<void> | null = null;

  let pausado = false; // true enquanto o app fala, para não ouvir a si mesmo
  let ignorarAte = 0;
  let aguardando = false; // já ouviu "farol", falta a pergunta
  let prazo: ReturnType<typeof setTimeout> | null = null;
  let eventos: EventosEscuta | null = null;

  function definirEventos(novos: EventosEscuta | null) {
    eventos = novos;
  }

  function cancelarEspera() {
    aguardando = false;
    if (prazo) clearTimeout(prazo);
    prazo = null;
  }

  function esperarPergunta() {
    cancelarEspera();
    aguardando = true;
    prazo = setTimeout(() => {
      aguardando = false;
      prazo = null;
      eventos?.aoExpirar();
    }, TEMPO_PARA_PERGUNTA_MS);
  }

  // Chamado a cada frase reconhecida (o Vosk entrega o resultado após uma pausa na fala)
  function aoResultado(bruto: unknown) {
    if (!rodando || pausado || Date.now() < ignorarAte) return;

    const texto = extrairTexto(bruto).toLowerCase();
    if (texto.length < 3) return; // ruído

    if (aguardando) {
      cancelarEspera();
      eventos?.aoReceberPergunta(texto);
      return;
    }

    const achou = texto.match(ATIVACAO);
    if (!achou) return;

    const resto = texto.slice((achou.index ?? 0) + achou[0].length).trim();
    if (resto) {
      eventos?.aoReceberPergunta(resto);
    } else {
      esperarPergunta();
      eventos?.aoAtivar();
    }
  }

  function removerOuvintes() {
    ouvintes.forEach((o) => o.remove());
    ouvintes = [];
  }

  function iniciar(): Promise<void> {
    if (rodando) return Promise.resolve();
    if (emInicio) return emInicio;

    emInicio = (async () => {
      const Classe = Vosk;
      if (!Classe) throw new Error("Reconhecimento de voz indisponível");
      try {
        const v = vosk ?? new Classe();
        vosk = v;
        if (!modeloPronto) {
          await v.loadModel(MODELO); // a parte lenta: só acontece uma vez
          modeloPronto = true;
        }
        ouvintes = [
          v.onResult(aoResultado),
          v.onError((erro) => eventos?.aoErro(String(erro))),
        ];
        rodando = true;
        await v.start();
      } catch (erro) {
        rodando = false;
        removerOuvintes();
        throw erro;
      } finally {
        emInicio = null;
      }
    })();
    return emInicio;
  }

  // Para de ouvir, mas mantém o modelo carregado para voltar rápido
  async function parar() {
    if (emInicio) {
      try {
        await emInicio;
      } catch {
        // já tratado por quem chamou iniciar()
      }
    }
    rodando = false;
    cancelarEspera();
    removerOuvintes();
    try {
      await vosk?.stop();
    } catch {
      // ignorar: já estava parado
    }
  }

  // Para e descarrega o modelo da memória
  async function liberar() {
    await parar();
    try {
      vosk?.unload();
    } catch {
      // ignorar
    }
    vosk = null;
    modeloPronto = false;
  }

  function pausar() {
    pausado = true;
    cancelarEspera();
  }

  function retomar() {
    pausado = false;
    ignorarAte = Date.now() + FOLGA_APOS_PAUSA_MS;
  }

  // Usado pelo botão "Perguntar": a próxima frase já é a pergunta, sem dizer "farol"
  function perguntarAgora() {
    pausado = false;
    esperarPergunta();
  }

  return {
    definirEventos,
    iniciar,
    parar,
    liberar,
    pausar,
    retomar,
    perguntarAgora,
    estaRodando: () => rodando,
  };
}

export const motorEscuta = criarMotorEscuta();
