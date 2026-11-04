import { cabecalhosAutorizacao, urlServidor } from "./api";
import { gerenciadorFala, type PrioridadeMensagem } from "./gerenciadorFala";

export type MensagemBackend = {
  sessionId?: string;
  frameId?: number;
  timestamp?: number;
  expiraEmMs?: number;
  prioridade?: PrioridadeMensagem;
  motivo?: string;
  origem?: string;
  mensagem?: string | null;
  deveFalar?: boolean;
  interrompe?: boolean;
  eventos?: unknown[];
};

type OuvinteMensagem = (msg: MensagemBackend) => void;

class ServicoMensagens {
  private ativo = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private abortController: AbortController | null = null;
  private ouvintes: Set<OuvinteMensagem> = new Set();
  private ultimoFrameIdInformativo = 0;
  private consultando = false;

  private readonly INTERVALO_POLLING_MS = 350;

  public assinar(cb: OuvinteMensagem): () => void {
    this.ouvintes.add(cb);
    return () => {
      this.ouvintes.delete(cb);
    };
  }

  public iniciar() {
    if (this.ativo) return;
    this.ativo = true;
    this.consultando = false;
    this.agendarProxima(0);
  }

  public parar() {
    this.ativo = false;
    this.consultando = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private agendarProxima(tempoMs: number) {
    if (!this.ativo) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.timer = setTimeout(() => {
      this.consultarSaida();
    }, tempoMs);
  }

  private async consultarSaida() {
    if (!this.ativo || this.consultando) return;

    const base = urlServidor();
    if (!base) {
      this.agendarProxima(1500);
      return;
    }

    this.consultando = true;
    this.abortController = new AbortController();

    try {
      const resp = await fetch(`${base}/saida`, {
        method: "GET",
        headers: { Accept: "application/json", ...cabecalhosAutorizacao() },
        signal: this.abortController.signal,
      });

      if (!this.ativo) return;

      if (!resp.ok) {
        return;
      }

      const dados = await resp.json();
      if (!this.ativo) return;

      if (dados && dados.status !== "vazia" && dados.mensagem) {
        this.processarMensagem(dados as MensagemBackend);
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") {
        return;
      }
      // Ignora erro de rede temporário na fila de saída
    } finally {
      this.consultando = false;
      this.abortController = null;
      if (this.ativo) {
        this.agendarProxima(this.INTERVALO_POLLING_MS);
      }
    }
  }

  private processarMensagem(msg: MensagemBackend) {
    if (!msg.mensagem) return;

    const agora = Date.now();
    // O backend pode enviar timestamp em segundos float ou ms
    const timestampMs = msg.timestamp
      ? msg.timestamp < 1e11
        ? msg.timestamp * 1000
        : msg.timestamp
      : agora;

    const expiraEmMs = msg.expiraEmMs ?? 4000;

    // Descarta mensagem já expirada
    if (agora > timestampMs + expiraEmMs) {
      return;
    }

    const prioridade: PrioridadeMensagem = (msg.prioridade as PrioridadeMensagem) ?? 3;

    // Para mensagens informativas, descarta se o frameId for mais antigo que o último já falado
    if (prioridade === 3 && msg.frameId !== undefined) {
      if (msg.frameId < this.ultimoFrameIdInformativo) {
        return;
      }
      this.ultimoFrameIdInformativo = msg.frameId;
    }

    // Notifica ouvintes de UI
    this.ouvintes.forEach((cb) => {
      try {
        cb(msg);
      } catch (err) {
        console.error("Erro no ouvinte de mensagem:", err);
      }
    });

    // Se deveFalar for true, manda para a fila central de fala
    if (msg.deveFalar !== false) {
      gerenciadorFala.enfileirar({
        id: `${msg.frameId ?? Date.now()}`,
        texto: msg.mensagem,
        prioridade,
        interrompe: msg.interrompe ?? (prioridade === 1),
        expiraEmMs,
        timestamp: timestampMs,
        frameId: msg.frameId,
        deveFalar: true,
      });
    }
  }
}

export const servicoMensagens = new ServicoMensagens();
