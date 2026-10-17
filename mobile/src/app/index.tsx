import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";

import { descrever, Mensagem, Modo } from "../services/api";
import { criarNarrador, falar, parar } from "../services/fala";

// O módulo de voz só existe em build de desenvolvimento (não no Expo Go nem na web)
let Voice: any = null;
if (Platform.OS !== "web") {
  try {
    Voice = require("@react-native-voice/voice").default;
  } catch {
    Voice = null;
  }
}

const MODOS: { id: Modo; nome: string }[] = [
  { id: "ambiente", nome: "Ambiente" },
  { id: "texto", nome: "Ler texto" },
  { id: "produto", nome: "Produto" },
  { id: "documento", nome: "Documento" },
];

export default function Principal() {
  // ===== 1. TODOS OS HOOKS AQUI, NO TOPO =====
  const [permissao, pedirPermissao] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const imagem = useRef<string | null>(null);
  const historico = useRef<Mensagem[]>([]);

  const [modo, setModo] = useState<Modo>("ambiente");
  const [ocupado, setOcupado] = useState(false);
  const [resposta, setResposta] = useState("");

  // Guarda a versão mais recente de "executar" para o listener de voz
  const executarRef = useRef<(pergunta?: string) => Promise<void>>(async () => { });

  useEffect(() => {
    if (!Voice) return;
    Voice.onSpeechResults = (ev: { value?: string[] }) => {
      const texto = ev.value?.[0];
      if (texto) executarRef.current(texto);
    };
    Voice.onSpeechError = () => falar("Não entendi. Toque e tente de novo.");
    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  // ===== 2. FUNÇÕES =====
  async function executar(pergunta?: string) {
    if (ocupado) return;
    setOcupado(true);
    setResposta("");
    parar();

    try {
      if (!pergunta) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const foto = await camera.current?.takePictureAsync({ quality: 0.8, skipProcessing: true });
        if (!foto) throw new Error("Sem foto");
        const img = await ImageManipulator.manipulateAsync(
          foto.uri,
          [{ resize: { width: 1024 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );
        imagem.current = img.base64 ?? null;
        historico.current = [];
      }
      if (!imagem.current) {
        falar("Primeiro descreva uma imagem.");
        return;
      }

      falar("Analisando.");
      const narrador = criarNarrador();
      let completo = "";

      await descrever({
        imagemBase64: imagem.current,
        modo,
        pergunta,
        historico: historico.current,
        onTexto: (p) => {
          completo += p;
          setResposta(completo);
          narrador.adicionar(p);
        },
      });
      narrador.finalizar();

      historico.current = [
        ...historico.current,
        ...(pergunta ? [{ role: "user" as const, texto: pergunta }] : []),
        { role: "assistant" as const, texto: completo },
      ];
    } catch (erro) {
      console.log("ERRO AO DESCREVER:", erro);
      const msg = erro instanceof Error ? erro.message : String(erro);
      setResposta(`Erro: ${msg}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      falar("Não consegui analisar agora. Verifique a conexão e tente de novo.");
    } finally {
      setOcupado(false);
    }
  }
  executarRef.current = executar;

  async function ouvirPergunta() {
    if (!Voice) {
      falar("O reconhecimento de voz não está disponível neste aparelho.");
      return;
    }
    if (!imagem.current) {
      falar("Primeiro descreva uma imagem.");
      return;
    }
    parar();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Voice.start("pt-BR");
  }

  // ===== 3. SÓ AGORA OS RETURNS ANTECIPADOS =====
  if (!permissao) return <View style={e.tela} />;

  if (!permissao.granted) {
    return (
      <View style={[e.tela, e.centro]}>
        <Text style={e.texto}>Precisamos da câmera para descrever o que você aponta.</Text>
        <Pressable
          style={e.botaoGrande}
          onPress={pedirPermissao}
          accessibilityRole="button"
          accessibilityLabel="Permitir uso da câmera"
        >
          <Text style={e.botaoTexto}>Permitir câmera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={e.tela}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />

      <View style={e.modos}>
        {MODOS.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => { setModo(m.id); Haptics.selectionAsync(); }}
            accessibilityRole="button"
            accessibilityLabel={`Modo ${m.nome}`}
            accessibilityState={{ selected: modo === m.id }}
            style={[e.modo, modo === m.id && e.modoAtivo]}
          >
            <Text style={[e.modoTexto, modo === m.id && e.modoTextoAtivo]}>{m.nome}</Text>
          </Pressable>
        ))}
      </View>

      <View style={e.rodape}>
        {resposta !== "" && <Text style={e.resposta}>{resposta}</Text>}

        <Pressable
          style={[e.botaoGrande, ocupado && { opacity: 0.6 }]}
          onPress={() => executar()}
          disabled={ocupado}
          accessibilityRole="button"
          accessibilityLabel="Tirar foto e descrever"
          accessibilityHint="Aponte a câmera para o que deseja conhecer e toque duas vezes"
        >
          <Text style={e.botaoTexto}>{ocupado ? "Analisando..." : "Descrever"}</Text>
        </Pressable>

        <Pressable
          style={e.botaoSecundario}
          onPress={ouvirPergunta}
          accessibilityRole="button"
          accessibilityLabel="Fazer uma pergunta sobre a imagem"
        >
          <Text style={e.botaoSecundarioTexto}>Perguntar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const e = StyleSheet.create({
  tela: { flex: 1, backgroundColor: "#000" },
  centro: { justifyContent: "center", alignItems: "center", padding: 24, gap: 24 },
  texto: { color: "#fff", fontSize: 20, textAlign: "center" },
  modos: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 16, paddingTop: 56 },
  modo: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 24, backgroundColor: "#000a", minHeight: 48, justifyContent: "center" },
  modoAtivo: { backgroundColor: "#FFD400" },
  modoTexto: { color: "#fff", fontSize: 16 },
  modoTextoAtivo: { color: "#000", fontWeight: "600" },
  rodape: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, gap: 12, backgroundColor: "#000c" },
  resposta: { color: "#fff", fontSize: 18, lineHeight: 26 },
  botaoGrande: { backgroundColor: "#FFD400", minHeight: 96, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  botaoTexto: { color: "#000", fontSize: 24, fontWeight: "700" },
  botaoSecundario: { borderWidth: 2, borderColor: "#FFD400", minHeight: 64, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  botaoSecundarioTexto: { color: "#FFD400", fontSize: 20, fontWeight: "600" },
});