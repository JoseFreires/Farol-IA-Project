import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";

import { AreaResposta } from "../components/camera/AreaResposta";
import { BarraSuperior } from "../components/camera/BarraSuperior";
import { ModalPergunta } from "../components/camera/ModalPergunta";
import { PainelCamera } from "../components/camera/PainelCamera";
import { PermissaoCamera } from "../components/camera/PermissaoCamera";
import { textoStatus } from "../components/camera/textoStatus";
import { FUNCAO_DESCREVER } from "../data/funcoes";
import { useEscuta } from "../escuta/EscutaContext";
import { useChamadaPorVoz } from "../hooks/useChamadaPorVoz";
import { useCicloDescricao } from "../hooks/useCicloDescricao";
import { useEstilos } from "../hooks/useEstilos";
import { calar } from "../services/dialogo";
import { vibrar } from "../services/vibracao";
import { useConfig } from "../settings/ConfiguracoesContext";
import type { PaletaCores } from "../theme/tema";

function voltarAoMenu() {
  calar();
  if (router.canGoBack()) router.back();
  else router.replace("/menu");
}

// Porta de entrada: garante a permissão antes de ligar a câmera e iniciar o ciclo
export default function CameraScreen() {
  const [permissao, pedirPermissao] = useCameraPermissions();

  if (!permissao) return null;
  if (!permissao.granted) {
    return <PermissaoCamera aoPermitir={pedirPermissao} aoVoltar={voltarAoMenu} />;
  }
  return <TelaDescricao />;
}

// "Farol" -> câmera liga -> espera o celular parar -> foto -> câmera desliga -> descrição falada
function TelaDescricao() {
  const { pergunta: perguntaDaRota } = useLocalSearchParams<{ pergunta?: string | string[] }>();
  const { config } = useConfig();
  const { perguntarAgora } = useEscuta();
  const e = useEstilos(criarEstilos);
  const [modalAberto, setModalAberto] = useState(false);

  const ciclo = useCicloDescricao({
    perguntaInicial: Array.isArray(perguntaDaRota) ? perguntaDaRota[0] : perguntaDaRota,
    monitorPausado: modalAberto,
  });

  // Dizer "Farol" aqui: novo ciclo (se já terminou) ou pergunta para a foto em andamento
  useChamadaPorVoz(ciclo.pedir);

  function abrirModal() {
    calar();
    setModalAberto(true);
  }

  function enviarPergunta(texto: string) {
    setModalAberto(false);
    ciclo.pedir(texto);
  }

  async function ditarPergunta() {
    setModalAberto(false);
    calar();
    vibrar.toque();
    await perguntarAgora(); // a próxima frase falada chega em useChamadaPorVoz
  }

  const status = textoStatus(ciclo.fase, {
    resposta: ciclo.resposta,
    estabilizando: ciclo.estabilizando,
    capturaAutomatica: config.capturaAutomatica,
  });

  return (
    <View style={e.tela}>
      {ciclo.cameraLigada && (
        <CameraView
          ref={ciclo.camera}
          style={StyleSheet.absoluteFill}
          facing="back"
          onCameraReady={ciclo.aoCameraPronta}
        />
      )}

      <BarraSuperior titulo={FUNCAO_DESCREVER.titulo} aoVoltar={voltarAoMenu} />

      {/* Com a câmera desligada, o texto ocupa o corpo da tela; ligada, deixa a imagem livre */}
      <View style={e.corpo}>{!ciclo.cameraLigada && <AreaResposta texto={status} />}</View>

      <PainelCamera
        fase={ciclo.fase}
        cameraLigada={ciclo.cameraLigada}
        textoStatus={status}
        pergunta={ciclo.pergunta}
        capturaManual={!config.capturaAutomatica}
        aoEditarPergunta={abrirModal}
        aoRemoverPergunta={ciclo.removerPergunta}
        aoTirarFoto={ciclo.tirarFotoAgora}
        aoTirarOutraFoto={() => ciclo.iniciar()}
        aoOuvirNovamente={ciclo.repetirResposta}
      />

      <ModalPergunta
        visivel={modalAberto}
        valorInicial={ciclo.pergunta ?? ""}
        rotuloEnviar={ciclo.fase === "resultado" ? "Perguntar e tirar nova foto" : "Definir pergunta"}
        aoEnviar={enviarPergunta}
        aoDitar={ditarPergunta}
        aoFechar={() => setModalAberto(false)}
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
