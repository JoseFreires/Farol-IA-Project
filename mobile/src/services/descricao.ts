import { processar, SESSION_ID, type ResultadoProcessamento } from "./api";

const MSG_SEM_DESCRICAO = "Não consegui descrever esta imagem. Tente de novo.";
const MSG_SEM_MUDANCA = "Nada mudou desde a última foto.";
const MSG_SEM_SERVIDOR =
  "O endereço do servidor não está configurado. Abra as configurações e informe o endereço.";

// Cada descrição começa do zero no servidor: sessão nova = sem comparação com a foto anterior
function novaSessao(): string {
  return `${SESSION_ID}-${Date.now().toString(36)}`;
}

// Transforma a resposta do servidor em um texto sempre falável
export function textoDaResposta(resultado: ResultadoProcessamento): string {
  if (resultado.mensagem) return resultado.mensagem;
  if (resultado.motivo === "SEM_MUDANCA_VISUAL") return MSG_SEM_MUDANCA;
  return MSG_SEM_DESCRICAO;
}

// Envia a foto (e a pergunta, se houver) ao servidor e devolve o texto da descrição
export async function descreverImagem(imagemUri: string, pergunta?: string): Promise<string> {
  const resultado = await processar({
    imagemUri,
    pergunta,
    sessionId: novaSessao(),
    forcar: true, // pedido explícito da pessoa (o servidor atual pode ignorar este campo)
  });
  return textoDaResposta(resultado);
}

// Mensagem amigável (e falável) para qualquer falha no caminho foto -> servidor
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof Error) {
    if (erro.message.startsWith("Endereço do servidor")) return MSG_SEM_SERVIDOR;
    return `Não consegui processar agora: ${erro.message}. Verifique a conexão e tente de novo.`;
  }
  return "Não consegui processar agora. Verifique a conexão e tente de novo.";
}
