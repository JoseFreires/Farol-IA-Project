import { Ionicons } from "@expo/vector-icons";

import type { Modo } from "../services/api";

export type Icone = keyof typeof Ionicons.glyphMap;

export type Funcao = {
    modo: Modo;
    titulo: string;
    descricao: string;
    instrucao: string;
    icone: Icone;
};

// Funções disponíveis (cada uma corresponde a um modo do backend)
export const FUNCOES: Funcao[] = [
    {
        modo: "ambiente",
        titulo: "Ambiente",
        descricao: "Descreve o lugar, os objetos e onde cada um está.",
        instrucao: "Aponte a câmera para o ambiente e toque em Descrever.",
        icone: "eye-outline",
    },
    {
        modo: "texto",
        titulo: "Ler texto",
        descricao: "Lê placas, cardápios, cartas e qualquer texto à sua frente.",
        instrucao: "Enquadre o texto por inteiro e toque em Descrever.",
        icone: "document-text-outline",
    },
    {
        modo: "produto",
        titulo: "Produto",
        descricao: "Identifica a embalagem, a marca, a validade e os ingredientes.",
        instrucao: "Aponte para a frente da embalagem e toque em Descrever.",
        icone: "pricetag-outline",
    },
    {
        modo: "documento",
        titulo: "Documento",
        descricao: "Lê contas e papéis, destacando valores e datas.",
        instrucao: "Deixe o documento inteiro na imagem e toque em Descrever.",
        icone: "newspaper-outline",
    },
];

export type EmBreve = { titulo: string; descricao: string; icone: Icone };

// Funções planejadas (aparecem no menu, mas ainda não abrem)
export const EM_BREVE: EmBreve[] = [
    {
        titulo: "Boletos e cédulas",
        descricao: "Valida o código do boleto e reconhece notas de real.",
        icone: "barcode-outline",
    },
    {
        titulo: "Configurações",
        descricao: "Velocidade da voz e nível de detalhe das descrições.",
        icone: "settings-outline",
    },
];