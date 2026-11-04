import type { CameraView } from "expo-camera";
import { urlServidor } from "./api";

export type StatusTransmissao = "desconectado" | "conectando" | "transmitindo" | "erro";

type OuvinteStatus = (status: StatusTransmissao) => void;

function urlWebSocketFrames(): string {
  const base = urlServidor();
  if (!base) return "";
  const limpa = base.replace(/\/+$/, "");
  if (limpa.startsWith("https://")) {
    return limpa.replace("https://", "wss://") + "/ws/frames";
  }
  if (limpa.startsWith("http://")) {
    return limpa.replace("http://", "ws://") + "/ws/frames";
  }
  return `ws://${limpa}/ws/frames`;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binario = atob(base64);
  const tamanho = binario.length;
  const bytes = new Uint8Array(tamanho);
  for (let i = 0; i < tamanho; i++) {
    bytes[i] = binario.charCodeAt(i);
  }
  return bytes;
}

class ServicoTransmissao {
  private socket: WebSocket | null = null;
  private camera: CameraView | null = null;
  private status: StatusTransmissao = "desconectado";
  private ouvintesStatus: Set<OuvinteStatus> = new Set();

  private ativo = false;
  private enviando = false;
  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  private reconexaoTimer: ReturnType<typeof setTimeout> | null = null;
  private tentativaReconexao = 0;

  private readonly INTERVALO_MS = 100; // ~10 frames por segundo, ideal para visão contínua sem sobrecarregar a câmera
  private readonly INTERVALO_MINIMO_MS = 30; // Garante folga mínima entre capturas para o visor da câmera fluir suavemente
  private readonly MAX_BYTES = 2_000_000; // Limite padrão de 2 MB do backend

  public assinarStatus(cb: OuvinteStatus): () => void {
    this.ouvintesStatus.add(cb);
    cb(this.status);
    return () => {
      this.ouvintesStatus.delete(cb);
    };
  }

  private definirStatus(novo: StatusTransmissao) {
    if (this.status !== novo) {
      this.status = novo;
      this.ouvintesStatus.forEach((cb) => cb(novo));
    }
  }

  public iniciar(cameraRef: CameraView | null) {
    if (!cameraRef) return;
    this.camera = cameraRef;
    this.ativo = true;
    this.tentativaReconexao = 0;
    this.conectar();
  }

  public atualizarCamera(cameraRef: CameraView | null) {
    this.camera = cameraRef;
  }

  public parar() {
    this.ativo = false;
    this.enviando = false;

    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    if (this.reconexaoTimer) {
      clearTimeout(this.reconexaoTimer);
      this.reconexaoTimer = null;
    }

    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignorar
      }
      this.socket = null;
    }

    this.definirStatus("desconectado");
  }

  private conectar() {
    if (!this.ativo) return;
    const url = urlWebSocketFrames();
    if (!url) {
      this.definirStatus("erro");
      return;
    }

    console.log("ServicoTransmissao: conectando em", url);
    this.definirStatus("conectando");

    try {
      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        if (!this.ativo) {
          ws.close();
          return;
        }
        console.log("ServicoTransmissao: WebSocket conectado com sucesso!");
        this.socket = ws;
        this.tentativaReconexao = 0;
        this.definirStatus("transmitindo");
        this.agendarProximoFrame(0);
      };

      ws.onerror = (err) => {
        console.log("Erro no WebSocket de frames:", err);
        this.definirStatus("erro");
      };

      ws.onclose = (ev) => {
        console.log("WebSocket de frames fechado. Código:", ev.code, "Motivo:", ev.reason);
        this.socket = null;
        if (this.ativo) {
          this.definirStatus("erro");
          this.tentarReconectar();
        }
      };
    } catch (err) {
      console.log("Falha ao abrir WebSocket:", err);
      this.definirStatus("erro");
      this.tentarReconectar();
    }
  }

  private tentarReconectar() {
    if (!this.ativo) return;
    if (this.reconexaoTimer) clearTimeout(this.reconexaoTimer);

    // Atraso progressivo com teto de 8 segundos (1s, 2s, 4s, 8s)
    const atraso = Math.min(8000, 1000 * Math.pow(2, this.tentativaReconexao));
    this.tentativaReconexao++;

    this.reconexaoTimer = setTimeout(() => {
      this.conectar();
    }, atraso);
  }

  private agendarProximoFrame(tempoMs: number) {
    if (!this.ativo) return;
    this.loopTimer = setTimeout(() => {
      this.capturarEEnviar();
    }, tempoMs);
  }

  private async capturarEEnviar() {
    if (!this.ativo) return;

    // Regra obrigatória: se socket não está aberto ou envio anterior está pendente, descarta
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || this.enviando || !this.camera) {
      this.agendarProximoFrame(this.INTERVALO_MS);
      return;
    }

    this.enviando = true;
    const inicio = Date.now();

    try {
      // Captura sem som de obturador e sem processamento extra pesado
      const foto = await this.camera.takePictureAsync({
        quality: 0.35,
        shutterSound: false,
        skipProcessing: true,
        base64: true,
      });

      if (!this.ativo || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return;
      }

      if (foto?.base64) {
        const bytes = base64ToUint8Array(foto.base64);
        if (bytes.byteLength <= this.MAX_BYTES) {
          const bufferEnvio = bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength
          ) as ArrayBuffer;
          this.socket.send(bufferEnvio);
        }
      }
    } catch {
      // Falha temporária em um frame: descarta e segue em frente
    } finally {
      this.enviando = false;
      const duracao = Date.now() - inicio;
      const espera = Math.max(this.INTERVALO_MINIMO_MS, this.INTERVALO_MS - duracao);
      this.agendarProximoFrame(espera);
    }
  }
}

export const servicoTransmissao = new ServicoTransmissao();
