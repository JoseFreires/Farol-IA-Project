import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { Botao } from "../components/Botao";
import { FUNCOES } from "../data/funcoes";
import { useEscuta } from "../escuta/EscutaContext";
import { descrever, Modo } from "../services/api";
import { aguardarFimDaFala, criarNarrador, falar, parar } from "../services/fala";
import { vibrar } from "../services/vibracao";
import { obterConfig } from "../settings/atual";
import { LARGURA_FOTO } from "../settings/tipos";
import { cores, espaco, fonte, raio } from "../theme/tema";

export default function Descrever() {
  // ===== 1. TODOS OS HOOKS AQUI, NO TOPO (antes de qualquer return) =====
  const { modo: modoParam } = useLocalSearchParams<{ modo?: string }>();
  const insets = useSafeAreaInsets();
  const [permissao, pedirPermissao] = useCameraPermissions();
  const camera = useRef<CameraView>(null);

  const [cameraPronta, setCameraPronta] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [resposta, setResposta] = useState("");

  // Guarda a versão mais recente de "executar" para o listener de voz
  const executarRef = useRef<(pergunta?: string) => Promise<void>>(async () => {});

  // Escuta global (palavra "Farol"): cada pergunta falada dispara foto + envio, como o botão
  const { aoReceberPergunta, pausar, retomar, ativa } = useEscuta();
  useEffect(
    () => aoReceberPergunta((pergunta) => executarRef.current(pergunta)),
    [aoReceberPergunta],
  );

  // ===== 2. VALORES E FUNÇÕES =====
  const funcao = FUNCOES.find((f) => f.modo === modoParam) ?? FUNCOES[0];
  const modo: Modo = funcao.modo;

  function voltar() {
    parar();
    if (router.canGoBack()) router.back();
    else router.replace("/menu");
  }

  async function executar(pergunta?: string) {
    if (ocupado) return;
    setOcupado(true);
    setResposta("");
    parar();
    pausar(); // o microfone ignora a fala do app enquanto ele descreve

    try {
      // Tanto o botão quanto a voz ("Farol, ...") tiram uma foto nova do que a câmera vê agora
      if (!cameraPronta) {
        falar("A câmera ainda está iniciando. Tente de novo.");
        return;
      }
      if (!pergunta) vibrar.confirmar(); // por voz, a vibração já foi dada ao ouvir "Farol"
      const foto = await camera.current?.takePictureAsync({ quality: 0.8 });
      if (!foto) throw new Error("Sem foto");
      const img = await ImageManipulator.manipulateAsync(
        foto.uri,
        [{ resize: { width: LARGURA_FOTO[obterConfig().qualidadeFoto] } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      );

      falar("Analisando.");
      const narrador = criarNarrador();

      await descrever({
        imagemUri: img.uri,
        modo,
        pergunta, // vazio = descrição geral; com texto = pergunta sobre esta foto
        onTexto: (p) => {
          setResposta((atual) => atual + p);
          narrador.adicionar(p);
        },
      });
      narrador.finalizar();
    } catch (erro) {
      console.log("ERRO AO DESCREVER:", erro);
      vibrar.erro();
      const semServidor =
        erro instanceof Error && erro.message.startsWith("Endereço do servidor");
      falar(
        semServidor
          ? "O endereço do servidor não está configurado. Abra as configurações e informe o endereço."
          : "Não consegui analisar agora. Verifique a conexão e tente de novo.",
      );
    } finally {
      setOcupado(false);
      aguardarFimDaFala().then(retomar); // só volta a escutar quando o app terminar de falar
    }
  }
  executarRef.current = executar;

  // ===== 3. SÓ AGORA OS RETURNS ANTECIPADOS =====
  if (!permissao) return <View style={e.tela} />;

  if (!permissao.granted) {
    return (
      <SafeAreaView style={[e.tela, e.centro]}>
        <Text accessibilityRole="header" style={e.tituloPermissao}>
          Câmera necessária
        </Text>
        <Text style={e.textoPermissao}>
          O Farol usa a câmera para descrever o que você aponta. Nenhuma foto é guardada.
        </Text>
        <Botao titulo="Permitir câmera" grande onPress={pedirPermissao} style={{ alignSelf: "stretch" }} />
        <Botao
          titulo="Voltar ao menu"
          variante="secundario"
          onPress={voltar}
          style={{ alignSelf: "stretch" }}
        />
      </SafeAreaView>
    );
  }

  return (
    <View style={e.tela}>
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing="back"
        onCameraReady={() => setCameraPronta(true)}
      />

      {/* Barra superior */}
      <View style={[e.topo, { paddingTop: insets.top + espaco.sm }]}>
        <Pressable
          onPress={voltar}
          accessibilityRole="button"
          accessibilityLabel="Voltar ao menu"
          hitSlop={8}
          style={e.voltar}
        >
          <Ionicons name="arrow-back" size={28} color={cores.textoPrincipal} />
        </Pressable>
        <Text accessibilityRole="header" style={e.tituloTopo}>
          {funcao.titulo}
        </Text>
      </View>

      {/* Painel inferior */}
      <View style={[e.painel, { paddingBottom: insets.bottom + espaco.md }]}>
        <ScrollView style={e.areaTexto} showsVerticalScrollIndicator={false}>
          <Text style={e.resposta}>{resposta !== "" ? resposta : funcao.instrucao}</Text>
        </ScrollView>

        <Botao
          titulo={ocupado ? "Analisando..." : "Descrever"}
          grande
          desabilitado={ocupado}
          onPress={() => executar()}
          accessibilityLabel="Tirar foto e descrever"
          accessibilityHint={funcao.instrucao}
        />

        <Text style={e.dica}>
          {ativa
            ? 'Pergunte ao Farol o que está sendo visto. Diga "Farol" e faça sua pergunta.'
            : 'Para perguntar por voz, ative o assistente no menu e diga "Farol".'}
        </Text>
      </View>
    </View>
  );
}

const e = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  centro: { justifyContent: "center", padding: espaco.lg, gap: espaco.md },
  tituloPermissao: { color: cores.textoPrincipal, fontSize: fonte.titulo, fontWeight: "800" },
  textoPermissao: { color: cores.textoSecundario, fontSize: fonte.corpo, lineHeight: 26 },

  topo: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: espaco.md,
    paddingHorizontal: espaco.md,
    paddingBottom: espaco.sm,
    backgroundColor: cores.sobreCamera,
  },
  voltar: {
    width: 52,
    height: 52,
    borderRadius: raio.pill,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: cores.superficie,
  },
  tituloTopo: { color: cores.textoPrincipal, fontSize: fonte.subtitulo, fontWeight: "700" },

  painel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: espaco.sm,
    padding: espaco.md,
    borderTopLeftRadius: raio.lg,
    borderTopRightRadius: raio.lg,
    backgroundColor: cores.sobreCamera,
  },
  areaTexto: { maxHeight: 190 },
  resposta: { color: cores.textoPrincipal, fontSize: fonte.corpo, lineHeight: 26 },
  dica: {
    color: cores.textoSecundario,
    fontSize: fonte.pequeno,
    lineHeight: 21,
    textAlign: "center",
  },
});