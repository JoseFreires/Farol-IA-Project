import { Platform } from "react-native";

// ---------------------------------------------------------------------------
// Motor de escuta: reconhece fala continuamente (offline, com Vosk), procura a
// palavra "farol" como acionador EXCLUSIVO de perguntas e aguarda 2 segundos
// de silêncio após o usuário parar de falar para encerrar a pergunta.
// ---------------------------------------------------------------------------

// Pasta do modelo de português dentro de assets/ (o nome PRECISA começar com "model-")
export const MODELO = "model-pt-0.3";

// Ativação por voz: "farol", tolerando pequenas variações fonéticas do modelo acústico offline
const ATIVACAO = /\b(?:ei\s+)?(farol|faraó|varol|faroli)\b[\s,.!?:;-]*/i;

const SILENCIO_PERGUNTA_MS = 2000; // Tempo de silêncio para fechar a pergunta
const TIMEOUT_SEGURANCA_PERGUNTA_MS = 30_000; // Limite máximo de segurança se não houver fala
const FOLGA_APOS_PAUSA_MS = 500; // Folga de 500ms após áudio do sistema para evitar eco no microfone
const DEBOUNCE_ATIVACAO_ISOLADA_MS = 650; // Tempo para confirmar se "Farol" foi dito isolado

// ---- Módulo nativo -------------------------------------------------------

type Ouvinte = { remove: () => void };
type VoskNativo = {
  loadModel: (caminho: string) => Promise<unknown>;
  start: (opcoes?: { grammar?: string[]; timeout?: number }) => Promise<unknown>;
  stop: () => unknown;
  unload: () => unknown;
  onResult: (cb: (resultado: unknown) => void) => Ouvinte;
  onError: (cb: (erro: unknown) => void) => Ouvinte;
  onPartialResult?: (cb: (resultado: unknown) => void) => Ouvinte;
};

// Cria o objeto do Vosk. Depende do formato que o pacote exporta (classe ou instância pronta)
let criarVosk: (() => VoskNativo) | null = null;
if (Platform.OS !== "web") {
  try {
    const modulo = require("react-native-vosk");
    const candidato = modulo?.default ?? modulo?.Vosk ?? modulo;
    if (typeof candidato === "function") {
      const Classe = candidato as new () => VoskNativo;
      criarVosk = () => new Classe();
    } else if (candidato && typeof candidato.loadModel === "function") {
      criarVosk = () => candidato as VoskNativo;
    } else {
      console.log("VOSK: formato de exportação desconhecido. Chaves:", Object.keys(modulo ?? {}));
    }
  } catch (erro) {
    console.log("VOSK: não foi possível carregar o módulo:", erro);
  }
}

export const escutaDisponivel = criarVosk !== null;

// ---- Eventos que o motor dispara ------------------------------------------
export type EventosEscuta = {
  aoDetectarAtivacao: (perguntaImediata?: string) => void;
  aoPerguntaPronta: (pergunta: string) => void;
  aoExpirar: () => void;
  aoErro: (mensagem: string) => void;
};

// Remove do início da frase ecos do áudio do sistema ou palavras de gatilho
export function limparPrefixosPergunta(texto: string): string {
  let t = texto.trim();
  const padrao = /^(?:ei\s+)?(farol|faraó|varol|pode\s+(?:me\s+)?(?:perguntar|falar)|perguntar|falar|diga|por\s+favor)[\s,.:;!?]*/i;
  let mudou = true;
  while (mudou && t.length > 0) {
    const antes = t;
    t = t.replace(padrao, "").trim();
    mudou = t !== antes;
  }
  return t;
}

// Corrige imperfeições fonéticas notórias do modelo compacto Vosk (pt-BR)
// para os termos canônicos que o roteador do Farol reconhece
export function normalizarTranscricaoParaFarol(texto: string): string {
  if (!texto) return "";
  let t = texto.toLowerCase();

  // "de grau" -> "degrau"
  t = t.replace(/\bde\s+graus?\b/gi, "degrau");
  t = t.replace(/\bdegraus\b/gi, "degraus");

  // "corpo" frequentemente reconhecido no lugar de "copo"
  t = t.replace(/\bcorpos\b/gi, "copos");
  t = t.replace(/\bcorpo\b/gi, "copo");

  // Variações de garrafa
  t = t.replace(/\bgarafas\b/gi, "garrafas");
  t = t.replace(/\bgarafa\b/gi, "garrafa");

  // Variações de televisão
  t = t.replace(/\btele\s+vis[aã]o\b/gi, "televisão");
  t = t.replace(/\btelevisoes\b/gi, "televisões");

  // Variações de celular
  t = t.replace(/\bcelula\b/gi, "celular");

  // Variações de mochila
  t = t.replace(/\bmuxil[as]\b/gi, "mochila");

  // Variações de alguém
  t = t.replace(/\b(algum|augum)\b/gi, "alguém");

  return t.trim();
}

// Concatena duas sentenças sem duplicar palavras de sobreposição
export function concatenarSemDuplicar(base: string, novo: string): string {
  const b = base.trim();
  const n = novo.trim();
  if (!b) return n;
  if (!n) return b;
  if (b.toLowerCase().includes(n.toLowerCase())) return b;
  if (n.toLowerCase().startsWith(b.toLowerCase())) return n;

  const palavrasB = b.split(/\s+/);
  const palavrasN = n.split(/\s+/);
  let sobreposicao = 0;
  const maxCheck = Math.min(palavrasB.length, palavrasN.length);

  for (let i = 1; i <= maxCheck; i++) {
    const finalB = palavrasB.slice(-i).join(" ").toLowerCase();
    const inicioN = palavrasN.slice(0, i).join(" ").toLowerCase();
    if (finalB === inicioN) {
      sobreposicao = i;
    }
  }

  if (sobreposicao > 0) {
    return `${palavrasB.join(" ")} ${palavrasN.slice(sobreposicao).join(" ")}`.trim();
  }

  return `${b} ${n}`.trim();
}

function extrairTexto(bruto: unknown): string {
  if (typeof bruto === "string") {
    const t = bruto.trim();
    if (t.startsWith("{")) {
      try {
        const obj = JSON.parse(t) as { text?: unknown; partial?: unknown };
        if (typeof obj.text === "string" && obj.text.trim()) return obj.text.trim();
        if (typeof obj.partial === "string" && obj.partial.trim()) return obj.partial.trim();
        return "";
      } catch {
        return t;
      }
    }
    return t;
  }
  if (bruto && typeof bruto === "object") {
    const obj = bruto as Record<string, unknown>;
    if (typeof obj.text === "string" && obj.text.trim()) return obj.text.trim();
    if (typeof obj.partial === "string" && obj.partial.trim()) return obj.partial.trim();
  }
  return "";
}

export function criarMotorEscuta() {
  let vosk: VoskNativo | null = null;
  let modeloPronto = false;
  let ouvintes: Ouvinte[] = [];
  let rodando = false;
  let emInicio: Promise<void> | null = null;

  let pausado = false;
  let ignorarAte = 0;
  let filaTransicao: Promise<void> = Promise.resolve();

  // Controle da coleta da pergunta
  let coletandoPergunta = false;
  let bufferPergunta: string[] = [];
  let ultimoParcial = "";
  let timerSilencio: ReturnType<typeof setTimeout> | null = null;
  let timerSeguranca: ReturnType<typeof setTimeout> | null = null;
  let timerAtivacaoIsolada: ReturnType<typeof setTimeout> | null = null;

  let eventos: EventosEscuta | null = null;

  function definirEventos(novos: EventosEscuta | null) {
    eventos = novos;
  }

  function limparTimersPergunta() {
    if (timerSilencio) {
      clearTimeout(timerSilencio);
      timerSilencio = null;
    }
    if (timerSeguranca) {
      clearTimeout(timerSeguranca);
      timerSeguranca = null;
    }
  }

  function finalizarPergunta() {
    limparTimersPergunta();
    if (!coletandoPergunta) return;
    coletandoPergunta = false;

    let textoCompleto = bufferPergunta.join(" ").trim();
    if (ultimoParcial) {
      textoCompleto = concatenarSemDuplicar(textoCompleto, ultimoParcial);
    }
    bufferPergunta = [];
    ultimoParcial = "";

    textoCompleto = limparPrefixosPergunta(textoCompleto);
    textoCompleto = normalizarTranscricaoParaFarol(textoCompleto);

    if (textoCompleto.length >= 2) {
      eventos?.aoPerguntaPronta(textoCompleto);
    } else {
      eventos?.aoExpirar();
    }
  }

  function iniciarColetaPergunta() {
    limparTimersPergunta();
    if (timerAtivacaoIsolada) {
      clearTimeout(timerAtivacaoIsolada);
      timerAtivacaoIsolada = null;
    }
    coletandoPergunta = true;
    bufferPergunta = [];
    ultimoParcial = "";
    pausado = false;
    ignorarAte = Date.now() + FOLGA_APOS_PAUSA_MS;

    filaTransicao = filaTransicao.then(async () => {
      if (rodando && vosk && !pausado) {
        try {
          await vosk.start();
        } catch {
          // se já ativo, ignorar
        }
      }
    });

    // Limite de segurança se ninguém falar nada
    timerSeguranca = setTimeout(() => {
      finalizarPergunta();
    }, TIMEOUT_SEGURANCA_PERGUNTA_MS);
  }

  function cancelarColetaPergunta() {
    limparTimersPergunta();
    if (timerAtivacaoIsolada) {
      clearTimeout(timerAtivacaoIsolada);
      timerAtivacaoIsolada = null;
    }
    coletandoPergunta = false;
    bufferPergunta = [];
    ultimoParcial = "";
  }

  function processarParcial(textoBruto: string) {
    if (!rodando || pausado || Date.now() < ignorarAte) return;
    const texto = textoBruto.toLowerCase().trim();
    if (texto.length < 2) return;

    if (coletandoPergunta) {
      const limpo = limparPrefixosPergunta(texto);
      if (!limpo || limpo.length < 2) return;
      ultimoParcial = limpo;

      // Reinicia o timer de silêncio enquanto o usuário estiver falando
      if (timerSilencio) {
        clearTimeout(timerSilencio);
      }
      timerSilencio = setTimeout(() => {
        finalizarPergunta();
      }, SILENCIO_PERGUNTA_MS);
      return;
    }

    // Modo de escuta passiva: aguardando a palavra "Farol" em tempo real
    const achou = texto.match(ATIVACAO);
    if (!achou) return;

    const resto = texto.slice((achou.index ?? 0) + achou[0].length).trim();
    if (resto.length >= 2) {
      // Usuário já está falando a pergunta junto com a ativação: cancela ativação isolada
      if (timerAtivacaoIsolada) {
        clearTimeout(timerAtivacaoIsolada);
        timerAtivacaoIsolada = null;
      }
      ultimoParcial = resto;
      if (timerSilencio) {
        clearTimeout(timerSilencio);
      }
      timerSilencio = setTimeout(() => {
        if (rodando && !pausado && !coletandoPergunta) {
          const perguntaFinal = normalizarTranscricaoParaFarol(limparPrefixosPergunta(ultimoParcial));
          ultimoParcial = "";
          if (perguntaFinal.length >= 2) {
            eventos?.aoDetectarAtivacao(perguntaFinal);
          }
        }
      }, SILENCIO_PERGUNTA_MS);
    } else {
      // "Farol" detectado, mas a pessoa pode ainda estar completando a frase.
      // Agenda confirmação com debounce em vez de cortar a fala imediatamente.
      if (!timerAtivacaoIsolada) {
        timerAtivacaoIsolada = setTimeout(() => {
          timerAtivacaoIsolada = null;
          if (rodando && !pausado && !coletandoPergunta) {
            eventos?.aoDetectarAtivacao(undefined);
          }
        }, DEBOUNCE_ATIVACAO_ISOLADA_MS);
      }
    }
  }

  function processarTextoFinal(textoBruto: string) {
    if (!rodando || pausado || Date.now() < ignorarAte) return;
    const texto = textoBruto.toLowerCase().trim();
    if (texto.length < 2) return;

    if (coletandoPergunta) {
      const limpo = limparPrefixosPergunta(texto);
      if (!limpo || limpo.length < 2) return;

      const ultimoItem = bufferPergunta[bufferPergunta.length - 1] ?? "";
      if (ultimoItem.toLowerCase() !== limpo.toLowerCase()) {
        bufferPergunta.push(limpo);
      }
      ultimoParcial = "";

      // Reinicia o timer de 2 segundos de silêncio a cada frase finalizada
      if (timerSilencio) {
        clearTimeout(timerSilencio);
      }
      timerSilencio = setTimeout(() => {
        finalizarPergunta();
      }, SILENCIO_PERGUNTA_MS);

      return;
    }

    // Modo de escuta passiva no evento de resultado consolidado
    const achou = texto.match(ATIVACAO);
    if (!achou) return;

    if (timerAtivacaoIsolada) {
      clearTimeout(timerAtivacaoIsolada);
      timerAtivacaoIsolada = null;
    }

    const resto = texto.slice((achou.index ?? 0) + achou[0].length).trim();
    const restoNormalizado = normalizarTranscricaoParaFarol(limparPrefixosPergunta(resto));

    if (restoNormalizado.length >= 2) {
      // Pergunta já veio na mesma frase ("Farol, o que tem na frente?")
      eventos?.aoDetectarAtivacao(restoNormalizado);
    } else {
      // "Farol" dito sozinho e confirmado com pausa: pede pergunta
      eventos?.aoDetectarAtivacao(undefined);
    }
  }

  function aoResultadoFinal(bruto: unknown) {
    const texto = extrairTexto(bruto);
    if (texto) {
      processarTextoFinal(texto);
    }
  }

  function aoResultadoParcial(bruto: unknown) {
    const texto = extrairTexto(bruto);
    if (texto) {
      processarParcial(texto);
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
      const fabrica = criarVosk;
      if (!fabrica) throw new Error("Reconhecimento de voz indisponível");
      try {
        const v = vosk ?? fabrica();
        vosk = v;
        if (!modeloPronto) {
          await v.loadModel(MODELO);
          modeloPronto = true;
        }

        ouvintes = [
          v.onResult(aoResultadoFinal),
          v.onError((erro) => eventos?.aoErro(String(erro))),
        ];

        const vQualquer = v as unknown as { onFinalResult?: (cb: (r: unknown) => void) => Ouvinte };
        if (typeof vQualquer.onFinalResult === "function") {
          ouvintes.push(vQualquer.onFinalResult(aoResultadoFinal));
        }

        if (typeof v.onPartialResult === "function") {
          ouvintes.push(v.onPartialResult(aoResultadoParcial));
        }

        rodando = true;
        pausado = false;
        ignorarAte = Date.now() + FOLGA_APOS_PAUSA_MS;
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

  async function parar() {
    if (emInicio) {
      try {
        await emInicio;
      } catch {
        // ignorar
      }
    }
    rodando = false;
    pausado = false;
    cancelarColetaPergunta();
    removerOuvintes();
    if (timerAtivacaoIsolada) {
      clearTimeout(timerAtivacaoIsolada);
      timerAtivacaoIsolada = null;
    }
    filaTransicao = filaTransicao.then(async () => {
      try {
        await vosk?.stop();
      } catch {
        // ignorar
      }
    });
    await filaTransicao;
  }

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

  // Pausa real do microfone nativo (evita eco e auto-gravação quando o app fala)
  function pausar(): Promise<void> {
    pausado = true;
    limparTimersPergunta();
    if (timerAtivacaoIsolada) {
      clearTimeout(timerAtivacaoIsolada);
      timerAtivacaoIsolada = null;
    }
    filaTransicao = filaTransicao.then(async () => {
      if (rodando && vosk) {
        try {
          await vosk.stop();
        } catch {
          // ignorar
        }
      }
    });
    return filaTransicao;
  }

  // Retoma escuta nativa com folga de silêncio para dissipar ecos acústicos
  function retomar(): Promise<void> {
    if (!rodando) return Promise.resolve();
    ignorarAte = Date.now() + FOLGA_APOS_PAUSA_MS;
    pausado = false;
    filaTransicao = filaTransicao.then(async () => {
      if (rodando && vosk && !pausado) {
        try {
          await vosk.start();
        } catch {
          // ignorar
        }
      }
    });
    return filaTransicao;
  }

  // Aciona explicitamente o modo de pergunta (usado pelo botão ou gesto)
  function perguntarAgora() {
    iniciarColetaPergunta();
  }

  return {
    definirEventos,
    iniciar,
    parar,
    liberar,
    pausar,
    retomar,
    iniciarColetaPergunta,
    perguntarAgora,
    cancelarColetaPergunta,
    estaRodando: () => rodando,
    estaColetandoPergunta: () => coletandoPergunta,
  };
}

export const motorEscuta = criarMotorEscuta();
