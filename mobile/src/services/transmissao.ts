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
  private geracao = 0;
  private proximoIdConexao = 0;
  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  private reconexaoTimer: ReturnType<typeof setTimeout> | null = null;
  private tentativaReconexao = 0;
  private ultimaFalhaCapturaLog = 0;
  private quadrosEnviados = 0;
  private bytesEnviados = 0;
  private duracaoCapturaMs = 0;
  private inicioResumo = Date.now();
  private limiteFrameLog = 0;

  private readonly INTERVALO_MS = 1000 / 30; // Meta de 30 quadros por segundo
  private readonly LIMITE_BUFFER_BYTES = 256_000;
  private readonly ESPERA_CONGESTIONAMENTO_MS = 15;
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
    if (
      this.socket?.readyState === WebSocket.CONNECTING ||
      this.socket?.readyState === WebSocket.OPEN ||
      this.reconexaoTimer
    ) {
      return;
    }
    this.conectar();
  }

  public atualizarCamera(cameraRef: CameraView | null) {
    this.camera = cameraRef;
  }

  public parar() {
    this.ativo = false;
    this.geracao += 1;

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
    if (
      this.socket?.readyState === WebSocket.CONNECTING ||
      this.socket?.readyState === WebSocket.OPEN
    ) {
      return;
    }
    const url = urlWebSocketFrames();
    if (!url) {
      this.definirStatus("erro");
      return;
    }

    const conexaoId = ++this.proximoIdConexao;
    console.log("ServicoTransmissao: conectando", conexaoId, "em", url);
    this.definirStatus("conectando");

    try {
      const ws = new WebSocket(url);
      this.socket = ws;
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        if (!this.ativo || this.socket !== ws) {
          ws.close();
          return;
        }
        console.log("ServicoTransmissao: WebSocket", conexaoId, "conectado com sucesso!");
        this.socket = ws;
        this.tentativaReconexao = 0;
        this.definirStatus("transmitindo");
        this.agendarProximoFrame(0);
      };

      ws.onerror = (err) => {
        if (this.socket !== ws) return;
        console.log("Erro no WebSocket de frames:", err);
        this.definirStatus("erro");
      };

      ws.onclose = (ev) => {
        if (this.socket !== ws) return;
        console.log("WebSocket", conexaoId, "de frames fechado. Código:", ev.code, "Motivo:", ev.reason);
        this.socket = null;
        if (this.loopTimer) {
          clearTimeout(this.loopTimer);
          this.loopTimer = null;
        }
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
      this.reconexaoTimer = null;
      this.conectar();
    }, atraso);
  }

  private agendarProximoFrame(tempoMs: number) {
    if (!this.ativo || this.socket?.readyState !== WebSocket.OPEN) return;
    if (this.loopTimer) clearTimeout(this.loopTimer);
    this.loopTimer = setTimeout(() => {
      this.loopTimer = null;
      this.capturarEEnviar();
    }, tempoMs);
  }

  private async capturarEEnviar() {
    if (!this.ativo) return;

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.camera) {
      this.agendarProximoFrame(250);
      return;
    }

    if (this.enviando) {
      this.agendarProximoFrame(250);
      return;
    }

    if (this.socket.bufferedAmount > this.LIMITE_BUFFER_BYTES) {
      this.agendarProximoFrame(this.ESPERA_CONGESTIONAMENTO_MS);
      return;
    }

    this.enviando = true;
    const geracao = this.geracao;
    const socket = this.socket;
    const inicio = Date.now();
    let capturaFalhou = false;

    try {
      // Captura sem som de obturador e sem processamento extra pesado
      const foto = await this.camera.takePictureAsync({
        quality: 0.35,
        shutterSound: false,
        skipProcessing: true,
        base64: true,
      });

      if (
        !this.ativo ||
        geracao !== this.geracao ||
        this.socket !== socket ||
        socket?.readyState !== WebSocket.OPEN
      ) {
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
          this.quadrosEnviados += 1;
          this.bytesEnviados += bytes.byteLength;
          this.duracaoCapturaMs += Date.now() - inicio;
          this.registrarResumoEnvio();
        } else {
          const agora = Date.now();
          if (agora - this.limiteFrameLog >= 15_000) {
            console.warn("Frame descartado por exceder limite:", bytes.byteLength, this.MAX_BYTES);
            this.limiteFrameLog = agora;
          }
        }
      }
    } catch (erro: unknown) {
      capturaFalhou = true;
      const agora = Date.now();
      if (agora - this.ultimaFalhaCapturaLog >= 15_000) {
        console.warn("Falha ao capturar ou preparar um frame; tentando o próximo.", erro);
        this.ultimaFalhaCapturaLog = agora;
      }
    } finally {
      this.enviando = false;
      if (geracao === this.geracao) {
        const duracao = Date.now() - inicio;
        const espera = capturaFalhou ? 1000 : Math.max(0, this.INTERVALO_MS - duracao);
        this.agendarProximoFrame(espera);
      }
    }
  }

  private registrarResumoEnvio() {
    const agora = Date.now();
    const intervalo = agora - this.inicioResumo;
    if (intervalo < 5000) return;

    console.info("Auditoria de frames mobile:", {
      quadros: this.quadrosEnviados,
      bytes: this.bytesEnviados,
      fps: Number((this.quadrosEnviados / (intervalo / 1000)).toFixed(2)),
      capturaMediaMs: Math.round(this.duracaoCapturaMs / this.quadrosEnviados),
    });
    this.quadrosEnviados = 0;
    this.bytesEnviados = 0;
    this.duracaoCapturaMs = 0;
    this.inicioResumo = agora;
  }
}

export const servicoTransmissao = new ServicoTransmissao();
