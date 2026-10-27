import { File as ExpoFile } from "expo-file-system";
import { fetch as streamFetch } from "expo/fetch"; // fetch com suporte a streaming

import { obterConfig } from "../settings/atual";
import { normalizarUrl } from "../settings/tipos";

// Endereço padrão vindo do .env (usado quando o usuário não informa outro nas configurações)
export const URL_PADRAO = normalizarUrl(process.env.EXPO_PUBLIC_API_URL ?? "");
const TOKEN = process.env.EXPO_PUBLIC_APP_TOKEN ?? "";

// Endereço em vigor: o das configurações, ou o padrão
export function urlServidor(): string {
  return normalizarUrl(obterConfig().servidorUrl) || URL_PADRAO;
}

const cabecalhos = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${TOKEN}`,
};

export type Modo = "ambiente" | "texto" | "produto" | "documento";
export type Mensagem = { role: "user" | "assistant"; texto: string };

type Params = {
  imagemBase64: string;
  modo: Modo;
  pergunta?: string;
  historico?: Mensagem[];
  onTexto: (pedaco: string) => void;
};

export async function descrever({
  imagemBase64,
  modo,
  pergunta,
  historico = [],
  onTexto,
}: Params): Promise<void> {
  const base = urlServidor();
  if (!base) throw new Error("Endereço do servidor não configurado.");

  const corpo = new FormData();
  if (Platform.OS === "web") {
    const respostaImagem = await fetch(imagemUri);
    if (!respostaImagem.ok) throw new Error("Não foi possível ler a imagem.");
    corpo.append("imagem", await respostaImagem.blob(), "imagem.jpg");
  } else {
    corpo.append("imagem", new ExpoFile(imagemUri));
  }
  corpo.append("modo", modo);
  corpo.append("detalhe", obterConfig().detalhe);
  corpo.append("historico", JSON.stringify(historico));
  if (pergunta) corpo.append("pergunta", pergunta);

  const resp = await streamFetch(`${base}/descrever`, {
    method: "POST",
    headers: cabecalhos,
    body: JSON.stringify({
      imagem_base64: imagemBase64,
      modo,
      pergunta,
      historico,
      detalhe: obterConfig().detalhe,
    }),
  });
  if (!resp.ok || !resp.body) throw new Error(`Erro ${resp.status}`);

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const eventos = buffer.split("\n\n");
    buffer = eventos.pop() ?? "";

    for (const ev of eventos) {
      const dado = ev.replace(/^data: /, "").trim();
      if (!dado || dado === "[FIM]") continue;
      const json = JSON.parse(dado);
      if (json.erro) throw new Error(json.erro);
      if (json.texto) onTexto(json.texto);
    }
  }
}

export type ResultadoProcessamento = {
  sessionId: string;
  contexto: string;
  status: string;
  deveFalar: boolean;
  mensagem: string | null;
  prioridade: string;
  idioma?: string;
  fallback?: boolean;
  motivo?: string | null;
};

type ProcessarParams = {
  imagemUri: string;
  sessionId?: string;
  contexto?: string;
  pergunta?: string;
};

export async function processar({
  imagemUri,
  sessionId = "mobile-session",
  contexto = "RESIDENCIAL",
  pergunta,
}: ProcessarParams): Promise<ResultadoProcessamento> {
  const base = urlServidor();
  if (!base) throw new Error("Endereço do servidor não configurado.");

  const corpo = new FormData();
  if (Platform.OS === "web") {
    const respostaImagem = await fetch(imagemUri);
    if (!respostaImagem.ok) throw new Error("Não foi possível ler a imagem.");
    corpo.append("imagem", await respostaImagem.blob(), "imagem.jpg");
  } else {
    corpo.append("imagem", new ExpoFile(imagemUri));
  }
  corpo.append("sessionId", sessionId);
  corpo.append("contexto", contexto);
  if (pergunta) corpo.append("pergunta", pergunta);

  const resp = await fetch(`${base}/processar`, {
    method: "POST",
    headers: { Authorization: cabecalhos.Authorization },
    body: corpo,
  });

  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => "");
    throw new Error(`Erro ${resp.status}${detalhe ? `: ${detalhe}` : ""}`);
  }

  return resp.json();
}

// Chama /health com limite de tempo. Aceita um endereço para testar antes de salvar.
export async function testarConexao(url?: string, tempoMs = 4000): Promise<boolean> {
  const base = normalizarUrl(url ?? "") || urlServidor();
  if (!base) return false;

  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), tempoMs);
  try {
    const resp = await fetch(`${base}/health`, { signal: controle.signal });
    return resp.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export type ResultadoBoleto =
  | { valido: true; valor: number; vencimento: string | null; banco: string }
  | { valido: false; motivo: string };

export async function validarBoleto(codigo: string): Promise<ResultadoBoleto> {
  const base = urlServidor();
  if (!base) throw new Error("Endereço do servidor não configurado.");

  const resp = await fetch(`${base}/boleto/validar`, {
    method: "POST",
    headers: cabecalhos,
    body: JSON.stringify({ codigo }),
  });
  if (!resp.ok) throw new Error(`Erro ${resp.status}`);
  return resp.json();
}