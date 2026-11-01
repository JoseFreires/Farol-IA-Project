export type VelocidadeFala = "lenta" | "normal" | "rapida" | "muitoRapida";
export type TomVoz = "grave" | "normal" | "agudo";
export type Detalhe = "resumo" | "normal" | "completo";
export type QualidadeFoto = "rapida" | "equilibrada" | "detalhada";

export type Configuracoes = {
  velocidadeFala: VelocidadeFala;
  tomVoz: TomVoz;
  vozId: string | null; // null = voz padrão do sistema
  detalhe: Detalhe;
  qualidadeFoto: QualidadeFoto;
  vibracao: boolean;
  servidorUrl: string; // vazio = usar o endereço do .env
  escutaAtiva: boolean; // assistente de voz ("Farol") ligado
};

export const PADRAO: Configuracoes = {
  velocidadeFala: "normal",
  tomVoz: "normal",
  vozId: null,
  detalhe: "normal",
  qualidadeFoto: "rapida",
  vibracao: true,
  servidorUrl: "",
  escutaAtiva: false,
};

// Tradução das escolhas para valores reais
export const TAXA_FALA: Record<VelocidadeFala, number> = {
  lenta: 0.5,
  normal: 1.1,
  rapida: 2,
  muitoRapida: 3,
};

export const TOM_VOZ: Record<TomVoz, number> = {
  grave: 0.5,
  normal: 1.5,
  agudo: 2.5,
};

export const LARGURA_FOTO: Record<QualidadeFoto, number> = {
  rapida: 1024,
  equilibrada: 1280,
  detalhada: 1536,
};

const VELOCIDADES = ["lenta", "normal", "rapida", "muitoRapida"] as const;
const TONS = ["grave", "normal", "agudo"] as const;
const DETALHES = ["resumo", "normal", "completo"] as const;
const QUALIDADES = ["rapida", "equilibrada", "detalhada"] as const;

function escolher<T extends string>(valor: unknown, validos: readonly T[], padrao: T): T {
  return typeof valor === "string" && (validos as readonly string[]).includes(valor)
    ? (valor as T)
    : padrao;
}

// Garante valores válidos mesmo que o armazenamento esteja vazio, antigo ou corrompido
export function normalizar(bruto: unknown): Configuracoes {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  return {
    velocidadeFala: escolher(b.velocidadeFala, VELOCIDADES, PADRAO.velocidadeFala),
    tomVoz: escolher(b.tomVoz, TONS, PADRAO.tomVoz),
    vozId: typeof b.vozId === "string" && b.vozId ? b.vozId : null,
    detalhe: escolher(b.detalhe, DETALHES, PADRAO.detalhe),
    qualidadeFoto: escolher(b.qualidadeFoto, QUALIDADES, PADRAO.qualidadeFoto),
    vibracao: typeof b.vibracao === "boolean" ? b.vibracao : PADRAO.vibracao,
    servidorUrl: typeof b.servidorUrl === "string" ? b.servidorUrl : PADRAO.servidorUrl,
     escutaAtiva: typeof b.escutaAtiva === "boolean" ? b.escutaAtiva : PADRAO.escutaAtiva,
  };
}

// "192.168.0.10:8000/" vira "http://192.168.0.10:8000"
export function normalizarUrl(texto: string): string {
  let url = texto.trim().replace(/\/+$/, "");
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url;
}