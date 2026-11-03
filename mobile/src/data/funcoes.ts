import { Ionicons } from "@expo/vector-icons";

export type Icone = keyof typeof Ionicons.glyphMap;

export type AcaoCamera = "descrever";

export type Funcao = {
  acao: AcaoCamera;
  titulo: string;
  descricao: string;
  instrucaoVoz: string; // falada ao abrir a câmera
  instrucaoEstavel: string; // falada quando o celular começa a ficar parado
  icone: Icone;
};

// Função principal do app: descrever em voz alta o que a câmera vê
export const FUNCAO_DESCREVER: Funcao = {
  acao: "descrever",
  titulo: "Descrever",
  descricao: "Aponte a câmera e ouça a descrição do que está à sua frente.",
  instrucaoVoz: "Aponte a câmera para o ambiente ou objeto a ser descrito.",
  instrucaoEstavel: "Mantenha a câmera parada.",
  icone: "eye-outline",
};

export const FUNCOES: Funcao[] = [FUNCAO_DESCREVER];

export type ItemMenu = { titulo: string; descricao: string; icone: Icone };

// Atalho para a tela de configurações
export const CONFIGURACOES: ItemMenu = {
  titulo: "Configurações",
  descricao: "Voz, captura automática e servidor.",
  icone: "settings-outline",
};