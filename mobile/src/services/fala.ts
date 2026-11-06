import * as Speech from "expo-speech";

import { gerenciadorFala, opcoesFala } from "./gerenciadorFala";

export { opcoesFala };

export function falar(texto: string) {
  gerenciadorFala.falarInstrucao(texto, false);
}

// Fala o texto de forma assíncrona, sem travar o aplicativo
export function falarAsync(texto: string, timeoutMs?: number): Promise<void> {
  const limite = timeoutMs ?? Math.max(3500, texto.length * 90);
  return new Promise((resolve) => {
    let concluido = false;
    const concluir = () => {
      if (concluido) return;
      concluido = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(concluir, limite);
    gerenciadorFala.falarInstrucao(texto, false).then(concluir, concluir);
  });
}

export async function estaFalando(): Promise<boolean> {
  try {
    const nativoFalando = await Speech.isSpeakingAsync();
    return gerenciadorFala.estaFalando() || nativoFalando;
  } catch {
    return gerenciadorFala.estaFalando();
  }
}

export function parar() {
  gerenciadorFala.calar();
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
        gerenciadorFala.enfileirar({
          texto: m[1],
          prioridade: 3,
          expiraEmMs: 4000,
        });
        buffer = buffer.slice(m[0].length);
      }
    },
    finalizar() {
      if (buffer.trim()) {
        gerenciadorFala.enfileirar({
          texto: buffer.trim(),
          prioridade: 3,
          expiraEmMs: 4000,
        });
      }
      buffer = "";
    },
  };
}
