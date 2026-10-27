import * as Speech from "expo-speech";

import { obterConfig } from "../settings/atual";
import { TAXA_FALA, TOM_VOZ } from "../settings/tipos";

const IDIOMA = "pt-BR";

// Monta as opções a cada fala, lendo a configuração em vigor
function opcoes(): Speech.SpeechOptions {
  const c = obterConfig();
  return {
    language: IDIOMA,
    rate: TAXA_FALA[c.velocidadeFala],
    pitch: TOM_VOZ[c.tomVoz],
    ...(c.vozId ? { voice: c.vozId } : {}),
  };
}

export function falar(texto: string) {
  Speech.speak(texto, opcoes());
}
// Fala o texto de forma assíncrona, sem travar o aplicativo, uso pra guiar o usuário com captura automatica ativa
export function falarAsync(texto: string, timeoutMs?: number): Promise<void> {
  return new Promise((resolve) => {
    let finalizado = false;
    const concluir = () => {
      if (!finalizado) {
        finalizado = true;
        clearTimeout(timer);
        resolve();
      }
    };

    const limite = timeoutMs ?? Math.max(3500, texto.length * 90);
    const timer = setTimeout(concluir, limite);

    Speech.speak(texto, {
      ...opcoes(),
      onDone: concluir,
      onStopped: concluir,
      onError: concluir,
    });
  });
}

export async function estaFalando(): Promise<boolean> {
  return Speech.isSpeakingAsync();
}

export function parar() {
  Speech.stop();
}

export type VozInfo = { id: string; nome: string; melhorQualidade: boolean };

// Vozes em português do Brasil instaladas no aparelho
export async function listarVozes(): Promise<VozInfo[]> {
  const vozes = await Speech.getAvailableVoicesAsync();
  return vozes
    .filter((v) => v.language.replace("_", "-").toLowerCase().startsWith("pt-br"))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((v) => ({
      id: v.identifier,
      nome: v.name,
      melhorQualidade: v.quality === Speech.VoiceQuality.Enhanced,
    }));
}

// Fala frase por frase, assim que cada uma termina, sem esperar a resposta inteira
export function criarNarrador() {
  let buffer = "";
  return {
    adicionar(pedaco: string) {
      buffer += pedaco;
      let m: RegExpMatchArray | null;
      while ((m = buffer.match(/^([\s\S]*?[.!?])\s+/))) {
        Speech.speak(m[1], opcoes());
        buffer = buffer.slice(m[0].length);
      }
    },
    finalizar() {
      if (buffer.trim()) Speech.speak(buffer.trim(), opcoes());
      buffer = "";
    },
  };
}