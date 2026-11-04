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

// Envia pergunta em texto usando o último contexto visual já mantido pelo backend
export async function enviarPergunta(texto: string): Promise<void> {
  const base = urlServidor();
  if (!base) throw new Error("Endereço do servidor não configurado.");

  const resposta = await fetch(`${base}/pergunta`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...autorizacao,
    },
    body: JSON.stringify({ texto }),
  });

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => "");
    throw new Error(`Erro ao enviar pergunta (${resposta.status}): ${detalhe}`);
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
