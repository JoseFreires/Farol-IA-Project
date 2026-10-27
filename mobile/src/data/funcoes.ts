import { Ionicons } from "@expo/vector-icons";

export type Icone = keyof typeof Ionicons.glyphMap;

export type AcaoCamera = "processar";

export type Funcao = {
  acao: AcaoCamera;
  titulo: string;
  descricao: string;
  instrucaoVoz: string;
  instrucaoEstavel?: string;
  icone: Icone;
};

// Função principal disponível no menu: Processar com agente inteligente
export const FUNCOES: Funcao[] = [
  {
    acao: "processar",
    titulo: "Câmera",
    descricao: "Aponte a câmera para o ambiente ou objeto a ser processado.",
    instrucaoVoz: "Aponte a câmera para o ambiente ou objeto a ser processado.",
    instrucaoEstavel: "Mantenha a câmera parada.",
    icone: "hardware-chip-outline",
  },
];

export type ItemMenu = { titulo: string; descricao: string; icone: Icone };

// Atalho para a tela de configurações
export const CONFIGURACOES: ItemMenu = {
  titulo: "Configurações",
  descricao: "Voz, captura automática e servidor.",
  icone: "settings-outline",
};