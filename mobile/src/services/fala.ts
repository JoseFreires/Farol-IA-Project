import * as Speech from "expo-speech";

import { gerenciadorFala, opcoesFala } from "./gerenciadorFala";

export { opcoesFala };

export function falar(texto: string) {
  gerenciadorFala.falarInstrucao(texto, false);
}

// Fala o texto de forma assíncrona, sem travar o aplicativo
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
      ...opcoesFala(),
      onDone: concluir,
      onStopped: concluir,
      onError: concluir,
    });
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

// Espera o app terminar de falar (usado para só voltar a escutar depois, sem ouvir a si mesmo)
export async function aguardarFimDaFala(limiteMs = 10_000): Promise<void> {
  const inicio = Date.now();
  await new Promise((r) => setTimeout(r, 200));
  while (Date.now() - inicio < limiteMs && (await estaFalando())) {
    await new Promise((r) => setTimeout(r, 100));
  }
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
        Speech.speak(m[1], opcoesFala());
        buffer = buffer.slice(m[0].length);
      }
    },
    finalizar() {
      if (buffer.trim()) Speech.speak(buffer.trim(), opcoesFala());
      buffer = "";
    },
  };
}
