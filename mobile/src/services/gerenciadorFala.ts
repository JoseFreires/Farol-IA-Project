import * as Speech from "expo-speech";

import { obterConfig } from "../settings/atual";
import { TAXA_FALA, TOM_VOZ } from "../settings/tipos";

const IDIOMA = "pt-BR";

export type PrioridadeMensagem = 1 | 2 | 3;

export type ItemFala = {
  id?: string;
  texto: string;
  prioridade: PrioridadeMensagem; // 1 = risco/erro/interrupção, 2 = resposta/sistema, 3 = informativa
  interrompe?: boolean;
  expiraEmMs?: number;
  timestamp?: number;
  frameId?: number;
  deveFalar?: boolean;
};

type OuvinteMensagem = (msg: ItemFala) => void;

export function opcoesFala(): Speech.SpeechOptions {
  const c = obterConfig();
  return {
    language: IDIOMA,
    rate: TAXA_FALA[c.velocidadeFala],
    pitch: TOM_VOZ[c.tomVoz],
    ...(c.vozId ? { voice: c.vozId } : {}),
  };
}

class GerenciadorFala {
  private fila: ItemFala[] = [];
  private itemAtual: ItemFala | null = null;
  private falando = false;
  private ultimaMensagemRelevante: ItemFala | null = null;
  private ouvintes: Set<OuvinteMensagem> = new Set();
  private timerFimFala: ReturnType<typeof setTimeout> | null = null;

  public assinar(ouvinte: OuvinteMensagem): () => void {
    this.ouvintes.add(ouvinte);
    if (this.ultimaMensagemRelevante) {
      ouvinte(this.ultimaMensagemRelevante);
    }
    return () => {
      this.ouvintes.delete(ouvinte);
    };
  }

  private notificarOuvintes(item: ItemFala) {
    this.ouvintes.forEach((cb) => {
      try {
        cb(item);
      } catch (err) {
        console.error("Erro no ouvinte de fala:", err);
      }
    });
  }

  public enfileirar(item: ItemFala) {
    if (item.deveFalar === false || !item.texto?.trim()) {
      return;
    }

    const agora = Date.now();
    const itemComTimestamp: ItemFala = {
      ...item,
      texto: item.texto.trim(),
      timestamp: item.timestamp ?? agora,
    };

    // Verifica se já chegou expirado
    if (this.estaExpirado(itemComTimestamp)) {
      return;
    }

    this.ultimaMensagemRelevante = itemComTimestamp;
    this.notificarOuvintes(itemComTimestamp);

    // Prioridade 1 (Risco, erro crítico) ou interrompe: true
    if (itemComTimestamp.prioridade === 1 || itemComTimestamp.interrompe) {
      // Limpa descrições informativas pendentes da fila
      this.fila = this.fila.filter((f) => f.prioridade === 1);

      if (this.falando && this.itemAtual) {
        // Se o que está falando é menos prioritário ou se interrompe explicitamente
        if (this.itemAtual.prioridade > 1 || itemComTimestamp.interrompe) {
          this.interromperFalaAtual();
          this.executarFala(itemComTimestamp);
          return;
        }
      } else {
        this.executarFala(itemComTimestamp);
        return;
      }
    }

    // Prioridade 2 (Resposta de pergunta ou instrução importante)
    if (itemComTimestamp.prioridade === 2) {
      // Remove da fila descrições informativas antigas
      this.fila = this.fila.filter((f) => f.prioridade !== 3);

      if (this.falando && this.itemAtual) {
        if (this.itemAtual.prioridade === 3) {
          // Interrompe descrição informativa que esteja falando
          this.interromperFalaAtual();
          this.executarFala(itemComTimestamp);
          return;
        }
      } else {
        this.executarFala(itemComTimestamp);
        return;
      }
    }

    // Prioridade 3 (Descrição informativa)
    if (itemComTimestamp.prioridade === 3) {
      // Descarta descrições informativas anteriores na fila: apenas a mais recente importa
      this.fila = this.fila.filter((f) => f.prioridade !== 3);

      if (!this.falando) {
        this.executarFala(itemComTimestamp);
        return;
      }
    }

    // Se estiver ocupado falando algo que não pode ser interrompido agora, enfileira ordenado por prioridade
    this.inserirOrdenado(itemComTimestamp);
  }

  private inserirOrdenado(item: ItemFala) {
    const idx = this.fila.findIndex((f) => f.prioridade > item.prioridade);
    if (idx === -1) {
      this.fila.push(item);
    } else {
      this.fila.splice(idx, 0, item);
    }
  }

  private estaExpirado(item: ItemFala): boolean {
    if (!item.expiraEmMs || !item.timestamp) return false;
    return Date.now() > item.timestamp + item.expiraEmMs;
  }

  private interromperFalaAtual() {
    if (this.timerFimFala) {
      clearTimeout(this.timerFimFala);
      this.timerFimFala = null;
    }
    Speech.stop();
    this.falando = false;
    this.itemAtual = null;
  }

  private executarFala(item: ItemFala) {
    if (this.estaExpirado(item)) {
      this.proximo();
      return;
    }

    this.interromperFalaAtual();
    this.falando = true;
    this.itemAtual = item;

    const aoTerminar = () => {
      if (this.timerFimFala) {
        clearTimeout(this.timerFimFala);
        this.timerFimFala = null;
      }
      this.falando = false;
      this.itemAtual = null;
      this.proximo();
    };

    // Timeout de segurança caso evento onDone do TTS falhe
    const limiteMs = Math.max(3500, item.texto.length * 90);
    this.timerFimFala = setTimeout(aoTerminar, limiteMs);

    Speech.speak(item.texto, {
      ...opcoesFala(),
      onDone: aoTerminar,
      onStopped: aoTerminar,
      onError: aoTerminar,
    });
  }

  private proximo() {
    if (this.falando || this.fila.length === 0) return;

    while (this.fila.length > 0) {
      const candidato = this.fila.shift()!;
      if (!this.estaExpirado(candidato)) {
        this.executarFala(candidato);
        return;
      }
    }
  }

  // Interrompe descrições informativas em andamento (chamado ao ouvir "Farol")
  public interromperInformativas() {
    this.fila = this.fila.filter((f) => f.prioridade !== 3);
    if (this.falando && this.itemAtual && this.itemAtual.prioridade === 3) {
      this.interromperFalaAtual();
    }
  }

  // Interrompe qualquer fala e limpa toda a fila
  public calar() {
    this.fila = [];
    this.interromperFalaAtual();
  }

  public falarInstrucao(texto: string, interrompe = true) {
    this.enfileirar({
      texto,
      prioridade: 2,
      interrompe,
      expiraEmMs: 6000,
      deveFalar: true,
    });
  }

  public repetirUltimaMensagem() {
    if (this.ultimaMensagemRelevante) {
      this.enfileirar({
        ...this.ultimaMensagemRelevante,
        prioridade: 2,
        interrompe: true,
        timestamp: Date.now(),
      });
    } else {
      this.falarInstrucao("Nenhuma mensagem anterior para repetir.");
    }
  }

  public obterUltimaMensagem(): ItemFala | null {
    return this.ultimaMensagemRelevante;
  }

  public estaFalando(): boolean {
    return this.falando;
  }
}

export const gerenciadorFala = new GerenciadorFala();

