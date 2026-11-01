import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { Botao } from "../components/Botao";
import { FUNCOES } from "../data/funcoes";
import { useEstabilidadeCamera } from "../hooks/useEstabilidadeCamera";
import { processar } from "../services/api";
import { estaFalando, falar, falarAsync, parar } from "../services/fala";
import { vibrar } from "../services/vibracao";
import { useConfig } from "../settings/ConfiguracoesContext";
import { LARGURA_FOTO } from "../settings/tipos";
import { espaco, fonte, raio, type PaletaCores } from "../theme/tema";

// O módulo de voz só existe em build de desenvolvimento (não no Expo Go nem na web)
let Voice: any = null;
if (Platform.OS !== "web") {
  try {
    Voice = require("@react-native-voice/voice").default;
  } catch {
    Voice = null;
  }
}

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const { config, cores, tema, alternarTema } = useConfig();
  const e = useMemo(() => criarEstilos(cores, config.altoContraste), [cores, config.altoContraste]);
  const [permissao, pedirPermissao] = useCameraPermissions();

  const funcao = FUNCOES[0];

  const camera = useRef<CameraView>(null);
  const imagemUriRef = useRef<string | null>(null);
  const orientacaoInicialFalada = useRef(false);

  const [cameraPronta, setCameraPronta] = useState(false);
  const [orientando, setOrientando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [resposta, setResposta] = useState("");
  const [concluido, setConcluido] = useState(false);

  // Estados para perguntas ao agente
  const [modalPerguntaVisivel, setModalPerguntaVisivel] = useState(false);
  const [textoPergunta, setTextoPergunta] = useState("");
  const [perguntaAtiva, setPerguntaAtiva] = useState<string | null>(null);

  // Mantém a versão atualizada da função de captura para chamadas síncronas/assíncronas
  const executarRef = useRef<(pergunta?: string) => Promise<void>>(async () => {});

  // Monitor de estabilidade via acelerômetro: só ativa APÓS o término da fala inicial
  const estabilidade = useEstabilidadeCamera({
    ativo:
      cameraPronta &&
      !orientando &&
      !ocupado &&
      !concluido &&
      config.capturaAutomatica,
    tempoEstabilidadeMs: 1400,
    limiarEstavel: 0.15,
    limiarMovimento: 0.35,
    onEstabilizando: () => {
      falarAsync(funcao.instrucaoEstavel ?? "Mantenha a câmera parada.").catch(() => {});
    },
    onDisparoAutomatico: async () => {
      // Garante que a fala de "Mantenha a câmera parada" tenha terminado antes de disparar
      let tentativas = 0;
      while ((await estaFalando().catch(() => false)) && tentativas < 25) {
        await new Promise((r) => setTimeout(r, 100));
        tentativas++;
      }
      executarRef.current();
    },
  });

  // Para qualquer fala ao desmontar a tela (quando o usuário sai da tela da câmera)
  useEffect(() => {
    return () => {
      parar();
    };
  }, []);

  // Fala a instrução inicial assim que a câmera estiver pronta e só libera estabilização após o término
  useEffect(() => {
    let montado = true;
    async function orientarInicial() {
      if (cameraPronta && !orientacaoInicialFalada.current) {
        orientacaoInicialFalada.current = true;
        setOrientando(true);
        try {
          await falarAsync(funcao.instrucaoVoz);
        } catch {
          // fallback
        }
        if (montado) {
          setOrientando(false);
        }
      }
    }
    orientarInicial();
    return () => {
      montado = false;
    };
  }, [cameraPronta, funcao.instrucaoVoz]);

  // Listener para perguntas por voz adicionais
  useEffect(() => {
    if (!Voice) return;
    Voice.onSpeechResults = (ev: { value?: string[] }) => {
      const texto = ev.value?.[0];
      if (texto) {
        setTextoPergunta(texto);
        submeterPergunta(texto);
      }
    };
    Voice.onSpeechError = () => falar("Não entendi a pergunta. Tente falar novamente ou digite.");
    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  function voltar() {
    parar();
    if (router.canGoBack()) router.back();
    else router.replace("/menu");
  }

  function tirarOutraFoto() {
    parar();
    imagemUriRef.current = null;
    setResposta("");
    setConcluido(false);
    setPerguntaAtiva(null);
    setTextoPergunta("");
    setOrientando(true);
    estabilidade.reiniciar();
    (async () => {
      try {
        await falarAsync(funcao.instrucaoVoz);
      } catch {}
      setOrientando(false);
    })();
  }

  function abrirModalPergunta() {
    parar();
    setTextoPergunta(perguntaAtiva ?? "");
    setModalPerguntaVisivel(true);
  }

  function submeterPergunta(texto: string) {
    const q = texto.trim();
    if (!q) return;

    setModalPerguntaVisivel(false);
    setTextoPergunta("");

    if (imagemUriRef.current) {
      // Já possui foto capturada: processa a pergunta imediatamente com a imagem
      capturarEProcessar(q);
    } else {
      // Foto ainda não capturada: armazena a pergunta para a captura seguinte
      setPerguntaAtiva(q);
      falar(`Pergunta anotada: ${q}. Agora aponte a câmera para que o agente analise.`);
    }
  }

  async function capturarEProcessar(perguntaEspecifica?: string) {
    if (ocupado) return;
    setOcupado(true);
    parar();

    try {
      const perguntaParaEnviar = perguntaEspecifica || perguntaAtiva || undefined;

      // Se ainda não tirou a foto, captura agora
      if (!imagemUriRef.current) {
        if (!cameraPronta) {
          falar("A câmera ainda está iniciando. Tente de novo.");
          setOcupado(false);
          return;
        }

        if (config.vibracao) vibrar.confirmar();

        const foto = await camera.current?.takePictureAsync({
          quality: 0.8,
          skipProcessing: true,
        });

        if (!foto) throw new Error("Não foi possível capturar a foto.");

        const img = await ImageManipulator.manipulateAsync(
          foto.uri,
          [{ resize: { width: LARGURA_FOTO[config.qualidadeFoto] } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
        );

        imagemUriRef.current = img.uri;
      }

      setResposta("");

      if (perguntaParaEnviar) {
        falar(`Consultando agente sobre: ${perguntaParaEnviar}`);
      } else {
        falar("Foto capturada. Processando com agente inteligente...");
      }

      const resultado = await processar({
        imagemUri: imagemUriRef.current,
        sessionId: "sessao-mobile",
        contexto: "RESIDENCIAL",
        pergunta: perguntaParaEnviar,
      });

      const textoResposta =
        resultado.mensagem || "Processamento concluído. Nenhum risco evidente foi detectado.";

      setResposta(textoResposta);

      if (resultado.deveFalar !== false) {
        falar(textoResposta);
      }

      setConcluido(true);
      setPerguntaAtiva(null);
    } catch (erro: any) {
      console.log("ERRO NO PROCESSAMENTO:", erro?.message, erro?.stack || erro);
      if (config.vibracao) vibrar.erro();
      const semServidor =
        erro instanceof Error && erro.message.startsWith("Endereço do servidor");
      falar(
        semServidor
          ? "O endereço do servidor não está configurado. Abra as configurações e informe o endereço."
          : `Não consegui processar agora: ${erro?.message || "erro de conexão"}. Verifique e tente de novo.`
      );
      setConcluido(false);
      estabilidade.reiniciar();
    } finally {
      setOcupado(false);
    }
  }

  executarRef.current = capturarEProcessar;

  async function ouvirPergunta() {
    if (!Voice) {
      falar("O reconhecimento por voz não está disponível. Use o microfone do teclado para ditar.");
      return;
    }
    parar();
    if (config.vibracao) vibrar.toque();
    await Voice.start("pt-BR");
  }

  if (!permissao) return <View style={e.tela} />;

  if (!permissao.granted) {
    return (
      <SafeAreaView style={[e.tela, e.centro]}>
        <Text accessibilityRole="header" style={e.tituloPermissao}>
          Câmera necessária
        </Text>
        <Text style={e.textoPermissao}>
          O Farol precisa da câmera para capturar e orientar você por voz. Nenhuma foto é
          compartilhada sem sua autorização.
        </Text>
        <Botao
          titulo="Permitir câmera"
          grande
          onPress={pedirPermissao}
          style={{ alignSelf: "stretch" }}
        />
        <Botao
          titulo="Voltar ao menu"
          variante="secundario"
          onPress={voltar}
          style={{ alignSelf: "stretch" }}
        />
      </SafeAreaView>
    );
  }

  const textoStatus = () => {
    if (ocupado) {
      return "Processando com agente inteligente...";
    }
    if (resposta !== "") {
      return resposta;
    }
    if (perguntaAtiva) {
      return `Pergunta para o agente: "${perguntaAtiva}". Aponte e mantenha a câmera parada para disparar.`;
    }
    if (orientando) {
      return funcao.instrucaoVoz;
    }
    if (estabilidade.estaEstabilizando) {
      return funcao.instrucaoEstavel ?? "Mantenha a câmera parada. Disparando em instantes...";
    }
    return "Aponte a câmera e mantenha parada para capturar.";
  };

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
        <View style={e.topoEsquerda}>
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

      </View>

      {/* Painel inferior de controle e acessibilidade */}
      <View style={[e.painel, { paddingBottom: insets.bottom + espaco.md }]}>
        {perguntaAtiva && !concluido && (
          <View style={e.badgePergunta}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={e.rotuloBadge}>Pergunta ao agente:</Text>
              <Text style={e.textoBadge} numberOfLines={1}>
                {perguntaAtiva}
              </Text>
            </View>
            <Pressable
              onPress={() => setPerguntaAtiva(null)}
              accessibilityRole="button"
              accessibilityLabel="Remover pergunta"
              style={e.botaoRemoverPergunta}
            >
              <Ionicons
                name="close-circle"
                size={22}
                color={cores.modo === "claro" ? cores.luzForte : cores.luz}
              />
            </Pressable>
          </View>
        )}

        <ScrollView style={e.areaTexto} showsVerticalScrollIndicator={false}>
          <Text style={e.resposta}>{textoStatus()}</Text>
        </ScrollView>

        {concluido ? (
          <View style={e.botoesConclusao}>
            <Botao
              titulo="Perguntar ao agente"
              grande
              onPress={abrirModalPergunta}
              accessibilityLabel="Fazer uma pergunta específica ao agente inteligente"
              accessibilityHint="Abre o campo para digitar ou ditar sua dúvida ao agente"
            />
            <Botao
              titulo="Tirar outra foto"
              variante="secundario"
              onPress={tirarOutraFoto}
              accessibilityLabel="Tirar outra foto e reiniciar captura"
              accessibilityHint="Reabre o monitoramento automático para uma nova captura"
            />
            <Botao
              titulo="Ouvir novamente"
              variante="secundario"
              onPress={() => falar(resposta)}
              accessibilityLabel="Repetir a leitura da resposta em voz alta"
            />
          </View>
        ) : (
          <View style={e.botoesCaptura}>
            <Botao
              titulo={
                perguntaAtiva ? "Alterar pergunta do agente" : "Definir pergunta ao agente"
              }
              variante="secundario"
              onPress={abrirModalPergunta}
              accessibilityLabel="Definir uma pergunta para o agente antes da captura"
              accessibilityHint="Permite especificar o que o agente deve localizar ou verificar"
            />
            <Botao
              titulo={
                ocupado
                  ? "Processando..."
                  : estabilidade.estaEstabilizando
                  ? "Estabilizando..."
                  : funcao.titulo
              }
              grande
              desabilitado={ocupado}
              onPress={() => capturarEProcessar()}
              accessibilityLabel="Tirar foto e processar com agente"
              accessibilityHint={
                config.capturaAutomatica
                  ? "Você também pode manter a câmera parada para disparo automático."
                  : "Toque para capturar a foto manualmente."
              }
            />
          </View>
        )}
      </View>

      {/* Modal Acessível para Perguntar ao Agente */}
      <Modal
        visible={modalPerguntaVisivel}
        transparent
        animationType="slide"
        onRequestClose={() => setModalPerguntaVisivel(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={e.modalFundo}
        >
          <View style={e.modalConteudo}>
            <View style={e.modalCabecalho}>
              <Text accessibilityRole="header" style={e.modalTitulo}>
                Pergunta ao Agente
              </Text>
              <Pressable
                onPress={() => setModalPerguntaVisivel(false)}
                accessibilityRole="button"
                accessibilityLabel="Fechar diálogo de pergunta"
                hitSlop={8}
                style={e.botaoFecharModal}
              >
                <Ionicons name="close" size={24} color={cores.textoPrincipal} />
              </Pressable>
            </View>

            <Text style={e.modalSubtitulo}>
              Pergunte ao agente sobre a localização de objetos, móveis ou riscos no ambiente residencial.
            </Text>

            <TextInput
              style={e.campoPergunta}
              value={textoPergunta}
              onChangeText={setTextoPergunta}
              placeholder="Ex: Onde está a mesa? Há algum risco no chão?"
              placeholderTextColor={cores.textoSuave}
              multiline
              numberOfLines={3}
              autoFocus
              returnKeyType="send"
              onSubmitEditing={() => submeterPergunta(textoPergunta)}
              accessibilityLabel="Campo de pergunta ao agente"
              accessibilityHint="Digite ou use a tecla de microfone do teclado do celular para ditar sua dúvida"
            />

            {/* Sugestões rápidas de toque */}
            <View style={e.sugestoesContainer}>
              <Text style={e.sugestoesRotulo}>Perguntas sugeridas:</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={e.sugestoesLista}
              >
                {[
                  "Onde está a mesa?",
                  "Há algum risco ou perigo?",
                  "O que está à minha frente?",
                  "O caminho está livre?",
                  "Onde está a cadeira?",
                ].map((sugestao) => (
                  <Pressable
                    key={sugestao}
                    onPress={() => setTextoPergunta(sugestao)}
                    accessibilityRole="button"
                    accessibilityLabel={`Usar sugestão: ${sugestao}`}
                    style={e.chipSugestao}
                  >
                    <Text style={e.chipTexto}>{sugestao}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={e.botoesModal}>
              {Voice && (
                <Botao
                  titulo="Ditar com microfone"
                  variante="secundario"
                  onPress={ouvirPergunta}
                  accessibilityLabel="Ativar microfone para falar pergunta"
                />
              )}
              <Botao
                titulo={imagemUriRef.current ? "Enviar pergunta ao agente" : "Definir pergunta"}
                grande
                desabilitado={!textoPergunta.trim()}
                onPress={() => submeterPergunta(textoPergunta)}
                accessibilityLabel="Confirmar pergunta ao agente"
              />
              <Botao
                titulo="Cancelar"
                variante="secundario"
                onPress={() => setModalPerguntaVisivel(false)}
                accessibilityLabel="Cancelar e fechar"
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function criarEstilos(cores: PaletaCores, altoContraste: boolean) {
  const eClaro = cores.modo === "claro";

  return StyleSheet.create({
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
      justifyContent: "space-between",
      paddingHorizontal: espaco.md,
      paddingBottom: espaco.sm,
      backgroundColor: cores.sobreCamera,
      borderBottomWidth: altoContraste ? 2 : eClaro ? 1.5 : 0,
      borderBottomColor: cores.borda,
    },
    topoEsquerda: {
      flexDirection: "row",
      alignItems: "center",
      gap: espaco.md,
    },
    voltar: {
      width: 52,
      height: 52,
      borderRadius: raio.pill,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: cores.superficie,
      borderWidth: altoContraste ? 2 : eClaro ? 1.5 : 0,
      borderColor: cores.borda,
    },
    botaoTema: {
      width: 50,
      height: 50,
      borderRadius: raio.pill,
      backgroundColor: cores.superficie,
      borderWidth: altoContraste ? 3 : 2,
      borderColor: cores.borda,
      justifyContent: "center",
      alignItems: "center",
    },
    tituloTopo: {
      color: cores.textoPrincipal,
      fontSize: fonte.subtitulo,
      fontWeight: "800",
    },

    painel: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      gap: espaco.sm,
      padding: espaco.md,
      borderTopLeftRadius: raio.lg,
      borderTopRightRadius: raio.lg,
      backgroundColor: eClaro ? "rgba(255, 255, 255, 0.96)" : cores.sobreCamera,
      borderTopWidth: altoContraste ? 3 : eClaro ? 1.5 : 0,
      borderTopColor: cores.borda,
    },
    badgePergunta: {
      backgroundColor: cores.superficieClara,
      padding: espaco.sm,
      borderRadius: raio.md,
      borderWidth: altoContraste ? 2 : 1,
      borderColor: eClaro ? cores.luzForte : cores.luz,
      flexDirection: "row",
      alignItems: "center",
      gap: espaco.sm,
    },
    rotuloBadge: {
      color: cores.luzSuave,
      fontSize: fonte.pequeno,
      fontWeight: "700",
    },
    textoBadge: {
      color: cores.textoPrincipal,
      fontSize: fonte.corpo,
      fontWeight: "700",
    },
    botaoRemoverPergunta: { padding: espaco.xs },

    areaTexto: { maxHeight: 180 },
    resposta: {
      color: cores.textoPrincipal,
      fontSize: fonte.corpo,
      lineHeight: 26,
      fontWeight: altoContraste ? "600" : "500",
    },
    botoesCaptura: { gap: espaco.sm },
    botoesConclusao: { gap: espaco.sm },

    // Estilos do Modal de Pergunta
    modalFundo: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.75)",
      justifyContent: "flex-end",
    },
    modalConteudo: {
      backgroundColor: cores.superficie,
      borderTopLeftRadius: raio.lg,
      borderTopRightRadius: raio.lg,
      padding: espaco.lg,
      gap: espaco.md,
      borderWidth: altoContraste ? 3 : eClaro ? 1 : 0,
      borderColor: cores.borda,
    },
    modalCabecalho: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    modalTitulo: {
      color: cores.textoPrincipal,
      fontSize: fonte.titulo,
      fontWeight: "800",
    },
    botaoFecharModal: {
      padding: espaco.xs,
      borderRadius: raio.pill,
      backgroundColor: cores.superficieClara,
      borderWidth: altoContraste ? 2 : 0,
      borderColor: cores.borda,
    },
    modalSubtitulo: {
      color: cores.textoSecundario,
      fontSize: fonte.pequeno,
      lineHeight: 22,
      fontWeight: altoContraste ? "600" : "400",
    },
    campoPergunta: {
      backgroundColor: cores.fundo,
      borderRadius: raio.md,
      borderWidth: altoContraste ? 3 : 2,
      borderColor: cores.borda,
      padding: espaco.md,
      color: cores.textoPrincipal,
      fontSize: fonte.corpo,
      minHeight: 84,
      textAlignVertical: "top",
    },
    sugestoesContainer: { gap: espaco.xs },
    sugestoesRotulo: {
      color: cores.luzSuave,
      fontSize: fonte.pequeno,
      fontWeight: "700",
    },
    sugestoesLista: { gap: espaco.xs },
    chipSugestao: {
      backgroundColor: cores.superficieClara,
      paddingHorizontal: espaco.md,
      paddingVertical: espaco.sm,
      borderRadius: raio.pill,
      borderWidth: altoContraste ? 2 : 1,
      borderColor: cores.borda,
    },
    chipTexto: {
      color: cores.textoPrincipal,
      fontSize: fonte.pequeno,
      fontWeight: altoContraste ? "700" : "500",
    },
    botoesModal: { gap: espaco.sm, marginTop: espaco.xs },
  });
}
