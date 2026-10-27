export type ModoTema = "escuro" | "claro";
export type VelocidadeFala = "lenta" | "normal" | "rapida" | "muitoRapida";
export type TomVoz = "grave" | "normal" | "agudo";
export type Detalhe = "resumo" | "normal" | "completo";
export type QualidadeFoto = "rapida" | "equilibrada" | "detalhada";

export type Configuracoes = {
  tema: ModoTema;
  altoContraste: boolean;
  velocidadeFala: VelocidadeFala;
  tomVoz: TomVoz;
  vozId: string | null; // null = voz padrão do sistema
  detalhe: Detalhe;
  qualidadeFoto: QualidadeFoto;
  capturaAutomatica: boolean;
  vibracao: boolean;
  servidorUrl: string; // vazio = usar o endereço do .env
};

export const PADRAO: Configuracoes = {
  tema: "escuro",
  altoContraste: false,
  velocidadeFala: "normal",
  tomVoz: "normal",
  vozId: null,
  detalhe: "normal",
  qualidadeFoto: "rapida",
  capturaAutomatica: true,
  vibracao: true,
  servidorUrl: "",
};

// Tradução das escolhas para valores reais
export const TAXA_FALA: Record<VelocidadeFala, number> = {
  lenta: 0.75,
  normal: 1,
  rapida: 1.3,
  muitoRapida: 1.7,
};

export const TOM_VOZ: Record<TomVoz, number> = {
  grave: 0.8,
  normal: 1,
  agudo: 1.2,
};

export const LARGURA_FOTO: Record<QualidadeFoto, number> = {
  rapida: 1024,
  equilibrada: 1280,
  detalhada: 1536,
};

const TEMAS = ["escuro", "claro"] as const;
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
    tema: escolher(b.tema, TEMAS, PADRAO.tema),
    altoContraste:
      typeof b.altoContraste === "boolean" ? b.altoContraste : PADRAO.altoContraste,
    velocidadeFala: escolher(b.velocidadeFala, VELOCIDADES, PADRAO.velocidadeFala),
    tomVoz: escolher(b.tomVoz, TONS, PADRAO.tomVoz),
    vozId: typeof b.vozId === "string" && b.vozId ? b.vozId : null,
    detalhe: escolher(b.detalhe, DETALHES, PADRAO.detalhe),
    qualidadeFoto: escolher(b.qualidadeFoto, QUALIDADES, PADRAO.qualidadeFoto),
    capturaAutomatica:
      typeof b.capturaAutomatica === "boolean"
        ? b.capturaAutomatica
        : PADRAO.capturaAutomatica,
    vibracao: typeof b.vibracao === "boolean" ? b.vibracao : PADRAO.vibracao,
    servidorUrl: typeof b.servidorUrl === "string" ? b.servidorUrl : PADRAO.servidorUrl,
  };
}

// "192.168.0.10:8000/" vira "http://192.168.0.10:8000"
export function normalizarUrl(texto: string): string {
  let url = texto.trim().replace(/\/+$/, "");
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url;
}