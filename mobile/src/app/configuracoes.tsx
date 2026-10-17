import { useEffect, useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Botao } from "../components/Botao";
import { LinhaOpcoes } from "../components/LinhaOpcoes";
import { LinhaSwitch } from "../components/LinhaSwitch";
import { testarConexao, URL_PADRAO } from "../services/api";
import { falar, listarVozes, parar, type VozInfo } from "../services/fala";
import { vibrar } from "../services/vibracao";
import { useConfig } from "../settings/ConfiguracoesContext";
import {
  normalizarUrl,
  type Detalhe,
  type QualidadeFoto,
  type TomVoz,
  type VelocidadeFala,
} from "../settings/tipos";
import { cores, espaco, fonte, raio } from "../theme/tema";

type Item<T extends string> = { valor: T; rotulo: string };

const VELOCIDADES: Item<VelocidadeFala>[] = [
  { valor: "lenta", rotulo: "Lenta" },
  { valor: "normal", rotulo: "Normal" },
  { valor: "rapida", rotulo: "Rápida" },
  { valor: "muitoRapida", rotulo: "Muito rápida" },
];

const TONS: Item<TomVoz>[] = [
  { valor: "grave", rotulo: "Grave" },
  { valor: "normal", rotulo: "Normal" },
  { valor: "agudo", rotulo: "Agudo" },
];

const DETALHES: Item<Detalhe>[] = [
  { valor: "resumo", rotulo: "Resumo" },
  { valor: "normal", rotulo: "Normal" },
  { valor: "completo", rotulo: "Completo" },
];

const QUALIDADES: Item<QualidadeFoto>[] = [
  { valor: "rapida", rotulo: "Rápida" },
  { valor: "equilibrada", rotulo: "Equilibrada" },
  { valor: "detalhada", rotulo: "Detalhada" },
];

function rotuloDe<T extends string>(lista: Item<T>[], valor: T): string {
  return lista.find((i) => i.valor === valor)?.rotulo.toLowerCase() ?? "";
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <View style={e.secao}>
      <Text accessibilityRole="header" style={e.tituloSecao}>
        {titulo}
      </Text>
      {children}
    </View>
  );
}

export default function Configuracoes() {
  // ===== Hooks no topo =====
  const { config, atualizar, restaurarPadroes } = useConfig();
  const [vozes, setVozes] = useState<VozInfo[]>([]);
  const [endereco, setEndereco] = useState(config.servidorUrl);
  const [campoEmFoco, setCampoEmFoco] = useState(false);
  const [testando, setTestando] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    listarVozes()
      .then(setVozes)
      .catch(() => setVozes([]));
    return () => parar();
  }, []);

  // ===== Ações =====
  function voltar() {
    parar();
    if (router.canGoBack()) router.back();
    else router.replace("/menu");
  }

  async function salvarETestar() {
    const url = normalizarUrl(endereco);
    atualizar({ servidorUrl: url });
    setEndereco(url);
    setTestando(true);
    setStatus("Testando conexão...");

    const ok = await testarConexao(url || URL_PADRAO);

    setTestando(false);
    const mensagem = ok
      ? "Conectado ao servidor."
      : "Não consegui conectar. Confira o endereço, o Wi-Fi e se o servidor está ligado.";
    setStatus(mensagem);
    ok ? vibrar.sucesso() : vibrar.erro();
    falar(mensagem);
  }

  function usarEnderecoPadrao() {
    atualizar({ servidorUrl: "" });
    setEndereco("");
    setStatus("");
    falar("Usando o endereço padrão do aplicativo.");
  }

  function restaurar() {
    restaurarPadroes();
    setEndereco("");
    setStatus("");
    falar("Configurações restauradas para o padrão.");
  }

  const opcoesVoz: Item<string>[] = [
    { valor: "", rotulo: "Padrão do sistema" },
    ...vozes.map((v, i) => ({
      valor: v.id,
      rotulo: `Voz ${i + 1}${v.melhorQualidade ? " (melhor qualidade)" : ""}`,
    })),
  ];

  const versao = Constants.expoConfig?.version ?? "1.0.0";

  return (
    <SafeAreaView style={e.tela}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={e.topo}>
          <Pressable
            onPress={voltar}
            accessibilityRole="button"
            accessibilityLabel="Voltar ao menu"
            hitSlop={8}
            style={e.voltar}
          >
            <Ionicons name="arrow-back" size={28} color={cores.textoPrincipal} />
          </Pressable>
          <Text accessibilityRole="header" style={e.titulo}>
            Configurações
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={e.conteudo}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ===== Voz ===== */}
          <Secao titulo="Voz">
            <LinhaOpcoes
              titulo="Velocidade da fala"
              opcoes={VELOCIDADES}
              valor={config.velocidadeFala}
              onChange={(v) => {
                atualizar({ velocidadeFala: v });
                falar(`Velocidade ${rotuloDe(VELOCIDADES, v)}`);
              }}
            />
            <LinhaOpcoes
              titulo="Tom da voz"
              opcoes={TONS}
              valor={config.tomVoz}
              onChange={(v) => {
                atualizar({ tomVoz: v });
                falar(`Tom ${rotuloDe(TONS, v)}`);
              }}
            />
            <LinhaOpcoes
              titulo="Voz"
              descricao={
                vozes.length === 0
                  ? "Nenhuma voz em português do Brasil foi encontrada além da padrão."
                  : undefined
              }
              opcoes={opcoesVoz}
              valor={config.vozId ?? ""}
              onChange={(v) => {
                atualizar({ vozId: v || null });
                falar("Esta é a voz selecionada.");
              }}
            />
            <Botao
              titulo="Testar voz"
              onPress={() =>
                falar("Olá! Eu sou o Farol. Esta é a minha voz, com as suas configurações.")
              }
              accessibilityHint="Fala uma frase de exemplo"
            />
            <Text style={e.nota}>
              Estas opções mudam a voz do Farol. A voz do leitor de tela do celular é configurada
              nos ajustes de acessibilidade do sistema.
            </Text>
          </Secao>

          {/* ===== Descrições ===== */}
          <Secao titulo="Descrições">
            <LinhaOpcoes
              titulo="Nível de detalhe"
              descricao="Resumo: até 2 frases. Normal: até 5 frases. Completo: mais detalhes, e demora um pouco mais."
              opcoes={DETALHES}
              valor={config.detalhe}
              onChange={(v) => {
                atualizar({ detalhe: v });
                falar(`Nível de detalhe: ${rotuloDe(DETALHES, v)}`);
              }}
            />
          </Secao>

          {/* ===== Câmera e toque ===== */}
          <Secao titulo="Câmera e toque">
            <LinhaOpcoes
              titulo="Qualidade da foto"
              descricao="Mais qualidade ajuda a ler textos pequenos, mas a resposta demora mais."
              opcoes={QUALIDADES}
              valor={config.qualidadeFoto}
              onChange={(v) => {
                atualizar({ qualidadeFoto: v });
                falar(`Qualidade da foto: ${rotuloDe(QUALIDADES, v)}`);
              }}
            />
            <LinhaSwitch
              titulo="Vibração"
              descricao="Vibra ao tirar a foto, ao confirmar e em caso de erro."
              valor={config.vibracao}
              onChange={(v) => {
                atualizar({ vibracao: v });
                vibrar.confirmar();
                falar(v ? "Vibração ligada" : "Vibração desligada");
              }}
            />
          </Secao>

          {/* ===== Servidor ===== */}
          <Secao titulo="Servidor">
            <Text style={e.rotulo}>Endereço do servidor</Text>
            <TextInput
              value={endereco}
              onChangeText={setEndereco}
              onFocus={() => setCampoEmFoco(true)}
              onBlur={() => setCampoEmFoco(false)}
              placeholder={URL_PADRAO || "http://192.168.0.10:8000"}
              placeholderTextColor={cores.textoSuave}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={salvarETestar}
              accessibilityLabel="Endereço do servidor"
              accessibilityHint="Deixe vazio para usar o endereço padrão do aplicativo"
              style={[e.campo, campoEmFoco && e.campoFoco]}
            />
            <Text style={e.nota}>
              Endereço padrão do aplicativo: {URL_PADRAO || "não definido"}.
            </Text>

            <Botao
              titulo={testando ? "Testando..." : "Salvar e testar conexão"}
              desabilitado={testando}
              onPress={salvarETestar}
            />
            <Botao
              titulo="Usar o endereço padrão"
              variante="secundario"
              onPress={usarEnderecoPadrao}
            />
            {status !== "" && <Text style={e.status}>{status}</Text>}
          </Secao>

          {/* ===== Sobre ===== */}
          <Secao titulo="Sobre">
            <Text style={e.texto}>Farol, versão {versao}.</Text>
            <Text style={e.texto}>
              As fotos são enviadas ao servidor apenas para gerar a descrição e não são guardadas.
            </Text>
            <Text style={e.texto}>
              As descrições são feitas por inteligência artificial e podem conter erros. Confirme
              informações importantes, como doses de medicamentos e valores de boletos, com outra
              pessoa ou fonte.
            </Text>
          </Secao>

          <Botao titulo="Restaurar configurações padrão" variante="secundario" onPress={restaurar} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  topo: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco.md,
    paddingHorizontal: espaco.md,
    paddingTop: espaco.sm,
    paddingBottom: espaco.sm,
  },
  voltar: {
    width: 52,
    height: 52,
    borderRadius: raio.pill,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: cores.superficie,
  },
  titulo: { color: cores.textoPrincipal, fontSize: fonte.titulo, fontWeight: "800" },
  conteudo: { padding: espaco.lg, gap: espaco.xl, paddingBottom: espaco.xl * 2 },
  secao: { gap: espaco.md },
  tituloSecao: { color: cores.luzSuave, fontSize: fonte.subtitulo, fontWeight: "800" },
  rotulo: { color: cores.textoPrincipal, fontSize: fonte.corpo, fontWeight: "700" },
  campo: {
    minHeight: 60,
    paddingHorizontal: espaco.md,
    borderRadius: raio.md,
    borderWidth: 2,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
    color: cores.textoPrincipal,
    fontSize: fonte.corpo,
  },
  campoFoco: { borderColor: cores.luz },
  nota: { color: cores.textoSecundario, fontSize: fonte.pequeno, lineHeight: 21 },
  status: { color: cores.luzSuave, fontSize: fonte.corpo, lineHeight: 26 },
  texto: { color: cores.textoSecundario, fontSize: fonte.corpo, lineHeight: 26 },
});