import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus, Linking, Pressable, StyleSheet, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useFocusEffect } from "expo-router";

import { BarraSuperior } from "../components/camera/BarraSuperior";
import { ModalPergunta } from "../components/camera/ModalPergunta";
import { PainelCamera } from "../components/camera/PainelCamera";
import { PermissaoCamera } from "../components/camera/PermissaoCamera";
import { useEscuta } from "../escuta/EscutaContext";
import { useChamadaPorVoz } from "../hooks/useChamadaPorVoz";
import { useEstilos } from "../hooks/useEstilos";
import { enviarPergunta } from "../services/api";
import { calar, dizer } from "../services/dialogo";
import { motorEscuta, normalizarTranscricaoParaFarol } from "../services/escuta";
import { gerenciadorFala } from "../services/gerenciadorFala";
import { servicoMensagens } from "../services/mensagens";
import { servicoTransmissao, type StatusTransmissao } from "../services/transmissao";
import { vibrar } from "../services/vibracao";
import type { PaletaCores } from "../theme/tema";

export default function CameraScreen() {
  const [permissao, pedirPermissao, obterPermissao] = useCameraPermissions();
  const [permissaoAtualizada, setPermissaoAtualizada] = useState<
    Awaited<ReturnType<typeof pedirPermissao>> | null
  >(null);
  const [solicitandoPermissao, setSolicitandoPermissao] = useState(false);
  const [erroPermissao, setErroPermissao] = useState<string | null>(null);
  const permissaoExibida = permissaoAtualizada ?? permissao;

  useEffect(() => {
    const assinatura = AppState.addEventListener("change", (estado: AppStateStatus) => {
      if (estado === "active") {
        obterPermissao()
          .then(setPermissaoAtualizada)
          .catch((erro: unknown) => {
            setErroPermissao(
              erro instanceof Error
                ? erro.message
                : "Não foi possível verificar a permissão da câmera."
            );
          });
      }
    });
    return () => assinatura.remove();
  }, [obterPermissao]);

  const permitirCamera = useCallback(async () => {
    setSolicitandoPermissao(true);
    setErroPermissao(null);
    try {
      if (permissaoExibida?.canAskAgain === false) {
        await Linking.openSettings();
      } else {
        const resultado = await pedirPermissao();
        setPermissaoAtualizada(resultado);
        if (!resultado.granted) {
          setErroPermissao(
            resultado.canAskAgain
              ? "A permissão não foi concedida. Toque em Permitir câmera para tentar novamente."
              : "O acesso foi bloqueado. Abra as configurações do aplicativo para permitir a câmera."
          );
        }
      }
    } catch (erro: unknown) {
      setErroPermissao(
        erro instanceof Error
          ? erro.message
          : "Não foi possível solicitar acesso à câmera."
      );
    } finally {
      setSolicitandoPermissao(false);
    }
  }, [permissaoExibida, pedirPermissao]);

  if (!permissaoExibida) return null;
  if (!permissaoExibida.granted) {
    return (
      <PermissaoCamera
        aoPermitir={permitirCamera}
        aoVoltar={() => router.push("/configuracoes")}
        precisaAbrirConfiguracoes={!permissaoExibida.canAskAgain}
        carregando={solicitandoPermissao}
        erro={erroPermissao}
      />
    );
  }
  return <TelaCameraContinua />;
}

function TelaCameraContinua() {
  const cameraRef = useRef<CameraView>(null);
  const { perguntarAgora, ouvindoPergunta } = useEscuta();
  const e = useEstilos(criarEstilos);

  const [modalAberto, setModalAberto] = useState(false);
  const [statusTransmissao, setStatusTransmissao] = useState<StatusTransmissao>("desconectado");
  const [ultimaMensagem, setUltimaMensagem] = useState<string>("");
  const [perguntaEmAndamento, setPerguntaEmAndamento] = useState<string | null>(null);

  const jaOrientou = useRef(false);
  const emFocoRef = useRef(false);
  const cameraProntaRef = useRef(false);

  // Pausa a escuta do Vosk enquanto a câmera está ligando e a orientação inicial não foi dita
  useEffect(() => {
    if (!jaOrientou.current) {
      motorEscuta.pausar();
    }
  }, []);

  // Escuta status da transmissão
  useEffect(() => {
    return servicoTransmissao.assinarStatus(setStatusTransmissao);
  }, []);

  // Escuta mensagens recebidas do backend para atualizar o painel visual
  useEffect(() => {
    return servicoMensagens.assinar((msg) => {
      if (msg.mensagem) {
        setUltimaMensagem(msg.mensagem);
        // Se a mensagem recebida for resposta (prioridade 2), limpa a indicação de pergunta em andamento
        if (msg.prioridade === 2) {
          setPerguntaEmAndamento(null);
        }
      }
    });
  }, []);

  // Inicia transmissão e consumo de mensagens quando a câmera estiver pronta e em foco
  useFocusEffect(
    useCallback(() => {
      emFocoRef.current = true;
      if (cameraProntaRef.current && cameraRef.current) {
        servicoTransmissao.iniciar(cameraRef.current);
        servicoMensagens.iniciar();
      }

      return () => {
        emFocoRef.current = false;
        servicoTransmissao.parar();
        servicoMensagens.parar();
        calar();
      };
    }, [])
  );

  // Gerencia segundo plano (AppState)
  useEffect(() => {
    const sub = AppState.addEventListener("change", (proximoEstado: AppStateStatus) => {
      if (proximoEstado === "active" && emFocoRef.current && cameraProntaRef.current && cameraRef.current) {
        servicoTransmissao.iniciar(cameraRef.current);
        servicoMensagens.iniciar();
      } else if (proximoEstado === "background") {
        servicoTransmissao.parar();
        servicoMensagens.parar();
        calar();
      }
    });
    return () => sub.remove();
  }, []);

  const aoCameraPronta = useCallback(async () => {
    cameraProntaRef.current = true;
    if (emFocoRef.current && cameraRef.current) {
      servicoTransmissao.iniciar(cameraRef.current);
      servicoMensagens.iniciar();
    }

    // Fala a instrução inicial ao abrir e só libera o Vosk após o término da fala
    if (!jaOrientou.current && emFocoRef.current) {
      jaOrientou.current = true;
      await dizer(
        "Câmera do Farol pronta. Aponte a câmera para o ambiente ou objeto à sua frente. Diga Farol para fazer uma pergunta ou segure na tela."
      );
    }
  }, []);

  // Envia pergunta ao backend (mantendo o fluxo de transmissão contínuo sem reenvio de foto)
  const processarPergunta = useCallback(async (texto: string) => {
    const pergunta = normalizarTranscricaoParaFarol(texto.trim());
    if (!pergunta) return;

    setPerguntaEmAndamento(pergunta);
    setUltimaMensagem(`Consultando: "${pergunta}"`);

    try {
      const resposta = await enviarPergunta(pergunta);
      setUltimaMensagem(resposta.texto);
      setPerguntaEmAndamento(null);
      gerenciadorFala.enfileirar({
        texto: resposta.texto,
        prioridade: 2,
        interrompe: false,
        expiraEmMs: 8000,
        frameId: resposta.frameId ?? undefined,
      });
    } catch (err) {
      console.error("Erro ao enviar pergunta:", err);
      vibrar.erro();
      gerenciadorFala.enfileirar({
        texto: "Não consegui enviar a pergunta. Verifique a conexão.",
        prioridade: 1,
        interrompe: true,
        expiraEmMs: 5000,
      });
      setPerguntaEmAndamento(null);
    }
  }, []);

  // Disparado quando o Vosk detecta pergunta pronta (após 2 segundos de silêncio ou dita junto de "Farol")
  useChamadaPorVoz(processarPergunta);

  // Gesto de backup: toque longo em qualquer área da câmera
  const aoGestoToqueLongo = useCallback(() => {
    vibrar.confirmar();
    perguntarAgora();
  }, [perguntarAgora]);

  function abrirModal() {
    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false);
  }

  function aoEnviarModal(texto: string) {
    fecharModal();
    processarPergunta(texto);
  }

  function aoDitarModal() {
    fecharModal();
    // Aguarda o teclado fechar completamente antes de emitir a instrução sonora
    setTimeout(() => {
      perguntarAgora();
    }, 200);
  }

  function aoConfigurar() {
    router.push("/configuracoes");
  }

  return (
    <View style={e.tela}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        onCameraReady={aoCameraPronta}
        animateShutter={false}
        mute={true}
      />

      {/* Camada para o gesto de toque longo acessível em toda a tela da câmera */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onLongPress={aoGestoToqueLongo}
        delayLongPress={600}
        accessibilityRole="button"
        accessibilityLabel="Visor da câmera. Segure por um segundo para fazer uma pergunta por voz."
      />

      <BarraSuperior
        titulo="Farol"
        statusTransmissao={statusTransmissao}
        aoConfigurar={aoConfigurar}
      />

      <View style={e.corpo} pointerEvents="none" />

      <PainelCamera
        ultimaMensagem={ultimaMensagem}
        perguntaEmAndamento={perguntaEmAndamento}
        ouvindoPergunta={ouvindoPergunta}
        aoFazerPergunta={abrirModal}
        aoRepetirMensagem={() => gerenciadorFala.repetirUltimaMensagem()}
      />

      <ModalPergunta
        visivel={modalAberto}
        valorInicial=""
        rotuloEnviar="Enviar pergunta"
        aoEnviar={aoEnviarModal}
        aoDitar={aoDitarModal}
        aoFechar={fecharModal}
      />
    </View>
  );
}

function criarEstilos(cores: PaletaCores) {
  return StyleSheet.create({
    tela: { flex: 1, backgroundColor: cores.fundo },
    corpo: { flex: 1 },
  });
}
