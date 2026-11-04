import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";

import { useEscuta } from "../escuta/EscutaContext";

// Executa `aoChamarFarol` quando a pergunta estiver pronta (dita após "Farol" ou diretamente)
export function useChamadaPorVoz(aoChamarFarol: (pergunta: string) => void) {
  const { aoChamar } = useEscuta();

  const ultima = useRef(aoChamarFarol);
  useEffect(() => {
    ultima.current = aoChamarFarol;
  }, [aoChamarFarol]);

  useFocusEffect(useCallback(() => aoChamar((pergunta) => ultima.current(pergunta)), [aoChamar]));
}
