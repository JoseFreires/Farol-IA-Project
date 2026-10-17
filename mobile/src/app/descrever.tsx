import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { Botao } from "../components/Botao";
import { FUNCOES } from "../data/funcoes";
import { descrever, Mensagem, Modo } from "../services/api";
import { criarNarrador, falar, parar } from "../services/fala";
import { cores, espaco, fonte, raio } from "../theme/tema";

// O módulo de voz só existe em build de desenvolvimento (não no Expo Go nem na web)
let Voice: any = null;
if (Platform.OS !== "web") {
    try {
        Voice = require("@react-native-voice/voice").default;
    } catch {
        Voice = null;
    }
}

export default function Descrever() {
    // ===== 1. TODOS OS HOOKS AQUI, NO TOPO (antes de qualquer return) =====
    const { modo: modoParam } = useLocalSearchParams<{ modo?: string }>();
    const insets = useSafeAreaInsets();
    const [permissao, pedirPermissao] = useCameraPermissions();
    const camera = useRef<CameraView>(null);
    const imagem = useRef<string | null>(null);
    const historico = useRef<Mensagem[]>([]);

    const [cameraPronta, setCameraPronta] = useState(false);
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

        try {
            if (!pergunta) {
                if (!cameraPronta) {
                    falar("A câmera ainda está iniciando. Tente de novo.");
                    return;
                }
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                const foto = await camera.current?.takePictureAsync({ quality: 0.8 });
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

                <Botao
                    titulo="Perguntar"
                    variante="secundario"
                    onPress={ouvirPergunta}
                    accessibilityLabel="Fazer uma pergunta sobre a imagem"
                />
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
});