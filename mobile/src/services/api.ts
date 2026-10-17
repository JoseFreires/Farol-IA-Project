import { fetch } from "expo/fetch"; // fetch com suporte a streaming

const API_URL = process.env.EXPO_PUBLIC_API_URL!;
const TOKEN = process.env.EXPO_PUBLIC_APP_TOKEN!;

export type Modo = "ambiente" | "texto" | "produto" | "documento";
export type Mensagem = { role: "user" | "assistant"; texto: string };

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${TOKEN}`,
};

type Params = {
  imagemBase64: string;
  modo: Modo;
  pergunta?: string;
  historico?: Mensagem[];
  onTexto: (pedaco: string) => void;
};

export async function descrever({
  imagemBase64, modo, pergunta, historico = [], onTexto,
}: Params): Promise<void> {
  const resp = await fetch(`${API_URL}/descrever`, {
    method: "POST",
    headers,
    body: JSON.stringify({ imagem_base64: imagemBase64, modo, pergunta, historico }),
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

export type ResultadoBoleto =
  | { valido: true; valor: number; vencimento: string | null; banco: string }
  | { valido: false; motivo: string };

export async function validarBoleto(codigo: string): Promise<ResultadoBoleto> {
  const resp = await fetch(`${API_URL}/boleto/validar`, {
    method: "POST",
    headers,
    body: JSON.stringify({ codigo }),
  });
  if (!resp.ok) throw new Error(`Erro ${resp.status}`);
  return resp.json();
}