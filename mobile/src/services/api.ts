import { File as ExpoFile } from "expo-file-system";
import { Platform } from "react-native";
import { obterConfig } from "../settings/atual";
import { normalizarUrl } from "../settings/tipos";

// Endereço padrão vindo do .env (usado quando o usuário não informa outro nas configurações)
export const URL_PADRAO = normalizarUrl(process.env.EXPO_PUBLIC_API_URL ?? "");
const TOKEN = process.env.EXPO_PUBLIC_APP_TOKEN ?? "";

// Endereço em vigor: o das configurações, ou o padrão
export function urlServidor(): string {
  return normalizarUrl(obterConfig().servidorUrl) || URL_PADRAO;
}

const autorizacao = { Authorization: `Bearer ${TOKEN}` };

// Identificador único de sessão usado em todas as chamadas ao servidor
export const SESSION_ID = "mobile-session";

export type ResultadoProcessamento = {
  sessionId: string;
  status: string;
  deveFalar: boolean;
  mensagem: string | null;
  prioridade: string;
  idioma?: string;
  fallback?: boolean;
  motivo?: string | null;
};

type ProcessarParams = {
  imagemUri: string; // uri local da foto (file://...) ou blob/data uri na web
  sessionId?: string;
  pergunta?: string;
  // true = a pessoa pediu agora (botão ou voz): o servidor descreve de novo,
  // sem os filtros de "nada mudou" feitos para monitoramento contínuo
  forcar?: boolean;
  timeoutMs?: number;
};

export async function processar({
  imagemUri,
  sessionId = SESSION_ID,
  pergunta,
  forcar = false,
  timeoutMs = 90_000, // o modelo local pode demorar
}: ProcessarParams): Promise<ResultadoProcessamento> {
  const base = urlServidor();
  if (!base) throw new Error("Endereço do servidor não configurado.");
  if (!imagemUri) throw new Error("Imagem não capturada (endereço da foto vazio).");

  const corpo = new FormData();
  if (Platform.OS === "web") {
    const respostaImagem = await fetch(imagemUri);
    if (!respostaImagem.ok) throw new Error("Não foi possível carregar a imagem.");
    corpo.append("imagem", await respostaImagem.blob(), "captura.jpg");
  } else {
    // O fetch do Expo só aceita Blob/File no multipart (o formato { uri, name, type } não funciona)
    corpo.append("imagem", new ExpoFile(imagemUri));
  }
  corpo.append("sessionId", sessionId);
  if (pergunta) corpo.append("pergunta", pergunta);
  if (forcar) corpo.append("forcar", "true");

  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), timeoutMs);
  try {
    const resp = await fetch(`${base}/processar`, {
      method: "POST",
      headers: autorizacao, // não defina Content-Type: o boundary do multipart é automático
      body: corpo,
      signal: controle.signal,
    });
    if (!resp.ok) {
      const detalhe = await resp.text().catch(() => "");
      throw new Error(`Erro ${resp.status}${detalhe ? `: ${detalhe}` : ""}`);
    }
    return await resp.json();
  } catch (erro) {
    if (controle.signal.aborted) throw new Error("O servidor demorou demais para responder.");
    throw erro;
  } finally {
    clearTimeout(timer);
  }
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