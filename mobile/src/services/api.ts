import { Platform } from "react-native";
import { File } from "expo-file-system";
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
  imagemUri: string;
  modo: Modo;
  pergunta?: string;
  historico?: Mensagem[];
  onTexto: (pedaco: string) => void;
};

export async function descrever({
  imagemUri,
  modo,
  pergunta,
  historico = [],
  onTexto,
}: Params): Promise<void> {
  const base = urlServidor();
  if (!base) throw new Error("Endereço do servidor não configurado.");

  const formData = new FormData();

  if (Platform.OS === "web") {
    const respostaImagem = await fetch(imagemUri);
    if (!respostaImagem.ok) throw new Error("Não foi possível carregar a imagem.");
    formData.append("imagem", await respostaImagem.blob(), "captura.jpg");
  } else {
    // File implementa a interface de Blob e é aceito pelo fetch do Expo
    formData.append("imagem", new File(imagemUri) as unknown as Blob, "captura.jpg");
  }
  formData.append("modo", modo);
  formData.append("pergunta", pergunta ?? "");
  formData.append("historico", JSON.stringify(historico));
  formData.append("detalhe", obterConfig().detalhe);

  const resp = await fetch(`${base}/processar`, {
    method: "POST",
    headers: { Authorization: cabecalhos.Authorization },
    body: formData,
  });
  if (!resp.ok) throw new Error(`Erro ${resp.status}`);

  const resultado: { deveFalar: boolean; mensagem: string | null } = await resp.json();
  if (resultado.deveFalar && resultado.mensagem) onTexto(resultado.mensagem);
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