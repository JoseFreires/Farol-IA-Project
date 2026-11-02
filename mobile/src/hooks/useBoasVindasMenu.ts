import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";

import { useEscuta } from "../escuta/EscutaContext";
import { calar, dizer } from "../services/dialogo";

const COMPLETA_LIGADO =
  "Menu do Farol. Diga Farol para descrever o que está à sua frente. " +
  "Se quiser, diga Farol e a sua pergunta. Ou toque no botão Descrever.";
const COMPLETA_DESLIGADO =
  "Menu do Farol. Toque no botão Descrever para usar a câmera. " +
  "Para chamar por voz, ative o assistente de voz logo abaixo.";
const CURTA_LIGADO = "Menu. Diga Farol ou toque em Descrever.";
const CURTA_DESLIGADO = "Menu. Toque em Descrever.";

// Ao abrir o menu, explica em voz alta como começar. Na primeira vez a fala é completa;
// ao voltar de outra tela ela é curta, para não cansar.
export function useBoasVindasMenu() {
  const { ativa } = useEscuta();

  const assistenteLigado = useRef(ativa);
  assistenteLigado.current = ativa;
  const jaApresentou = useRef(false);

  useFocusEffect(
    useCallback(() => {
      const ligado = assistenteLigado.current;
      const completa = !jaApresentou.current;
      jaApresentou.current = true;

      if (completa) dizer(ligado ? COMPLETA_LIGADO : COMPLETA_DESLIGADO);
      else dizer(ligado ? CURTA_LIGADO : CURTA_DESLIGADO);

      return calar; // sair do menu interrompe a fala
    }, []),
  );
}
