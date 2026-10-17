import * as Speech from "expo-speech";

const IDIOMA = "pt-BR";

export function falar(texto: string) {
  Speech.speak(texto, { language: IDIOMA });
}

export function parar() {
  Speech.stop();
}

// Fala frase por frase, assim que cada uma termina, sem esperar a resposta inteira
export function criarNarrador() {
  let buffer = "";
  return {
    adicionar(pedaco: string) {
      buffer += pedaco;
      let m: RegExpMatchArray | null;
      while ((m = buffer.match(/^([\s\S]*?[.!?])\s+/))) {
        Speech.speak(m[1], { language: IDIOMA });
        buffer = buffer.slice(m[0].length);
      }
    },
    finalizar() {
      if (buffer.trim()) Speech.speak(buffer.trim(), { language: IDIOMA });
      buffer = "";
    },
  };
}