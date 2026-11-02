import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";

import { useEscuta } from "../escuta/EscutaContext";

// Executa `aoChamarFarol` quando a pessoa diz "Farol" (com ou sem pergunta na mesma frase).
// Só escuta enquanto a tela está em foco: telas empilhadas (menu atrás da câmera) não disputam o comando.
export function useChamadaPorVoz(aoChamarFarol: (pergunta?: string) => void) {
  const { aoChamar } = useEscuta();

  const ultima = useRef(aoChamarFarol);
  ultima.current = aoChamarFarol;

  useFocusEffect(useCallback(() => aoChamar((pergunta) => ultima.current(pergunta)), [aoChamar]));
}
