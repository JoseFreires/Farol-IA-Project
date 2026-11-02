import { FUNCAO_DESCREVER } from "../../data/funcoes";
import type { Fase } from "../../hooks/useCicloDescricao";

type Contexto = {
  resposta: string;
  estabilizando: boolean;
  capturaAutomatica: boolean;
};

// O que a tela escreve (e o leitor de tela lê) em cada fase do ciclo
export function textoStatus(fase: Fase, { resposta, estabilizando, capturaAutomatica }: Contexto) {
  switch (fase) {
    case "iniciando":
      return "Abrindo a câmera...";
    case "orientando":
      return FUNCAO_DESCREVER.instrucaoVoz;
    case "mirando":
      if (estabilizando) return FUNCAO_DESCREVER.instrucaoEstavel;
      return capturaAutomatica
        ? "Aponte a câmera e mantenha parada para capturar."
        : "Aponte a câmera e toque em Tirar foto.";
    case "capturando":
      return "Capturando a foto...";
    case "processando":
      return "Processando com agente inteligente...";
    case "resultado":
      return resposta;
  }
}
