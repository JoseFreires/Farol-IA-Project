import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { useEscuta } from "../escuta/EscutaContext";
import { testarConexao, URL_PADRAO } from "../services/api";
import { falar, parar } from "../services/fala";
import { vibrar } from "../services/vibracao";
import { useConfig } from "../settings/ConfiguracoesContext";
import {
  normalizarUrl,
  type ModoTema,
  type VelocidadeFala,
} from "../settings/tipos";
import { espaco, fonte, raio, type PaletaCores } from "../theme/tema";

type Item<T extends string> = { valor: T; rotulo: string };

const TEMAS: Item<ModoTema>[] = [
  { valor: "escuro", rotulo: "Escuro" },
  { valor: "claro", rotulo: "Claro" },
];

const VELOCIDADES: Item<VelocidadeFala>[] = [
  { valor: "lenta", rotulo: "Lenta" },
  { valor: "normal", rotulo: "Normal" },
  { valor: "rapida", rotulo: "Rápida" },
  { valor: "muitoRapida", rotulo: "Muito rápida" },
];



function rotuloDe<T extends string>(lista: Item<T>[], valor: T): string {
  return lista.find((i) => i.valor === valor)?.rotulo.toLowerCase() ?? "";
}

function Secao({
  titulo,
  children,
  estiloSecao,
  estiloTitulo,
}: {
  titulo: string;
  children: ReactNode;
  estiloSecao?: object;
  estiloTitulo?: object;
}) {
  return (
    <View style={estiloSecao}>
      <Text accessibilityRole="header" style={estiloTitulo}>
        {titulo}
      </Text>
      {children}
    </View>
  );
}

export default function Configuracoes() {
  // ===== Hooks no topo =====
  const { config, cores, atualizar, restaurarPadroes } = useConfig();
  const { alternar } = useEscuta();
  const e = useMemo(() => criarEstilos(cores, config.altoContraste), [cores, config.altoContraste]);

  const [endereco, setEndereco] = useState(config.servidorUrl);
  const [campoEmFoco, setCampoEmFoco] = useState(false);
  const [testando, setTestando] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    return () => parar();
  }, []);

  // ===== Ações =====
  function voltar() {
    parar();
    if (router.canGoBack()) router.back();
    else router.replace("/camera");
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
    if (ok) vibrar.sucesso(); else vibrar.erro();
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


  const versao = Constants.expoConfig?.version ?? "1.0.0";

  return (
    <SafeAreaView style={e.tela}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={e.topo}>
          <View style={e.topoEsquerda}>
            <Pressable
              onPress={voltar}
              accessibilityRole="button"
              accessibilityLabel="Voltar à câmera"
              hitSlop={8}
              style={e.voltar}
            >
              <Ionicons name="arrow-back" size={28} color={cores.textoPrincipal} />
            </Pressable>
            <Text accessibilityRole="header" style={e.titulo}>
              Configurações
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={e.conteudo}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ===== Seção Visual no Topo ===== */}
          <Secao titulo="Visual" estiloSecao={e.secao} estiloTitulo={e.tituloSecao}>
            <LinhaOpcoes
              titulo="Tema"
              descricao="Escolha entre o modo escuro (mar profundo) e o modo claro (céu claro)."
              opcoes={TEMAS}
              valor={config.tema}
              onChange={(v) => {
                atualizar({ tema: v });
                vibrar.confirmar();
                falar(v === "claro" ? "Tema claro ativado." : "Tema escuro ativado.");
              }}
            />

            <LinhaSwitch
              titulo="Texto em alto contraste"
              descricao="Reforça as cores de texto e bordas para máxima legibilidade (padrão WCAG AAA)."
              valor={config.altoContraste}
              onChange={(v) => {
                atualizar({ altoContraste: v });
                vibrar.confirmar();
                falar(v ? "Alto contraste ativado." : "Alto contraste desativado.");
              }}
            />
          </Secao>

          {/* ===== Voz ===== */}
          <Secao titulo="Voz" estiloSecao={e.secao} estiloTitulo={e.tituloSecao}>
            <LinhaSwitch
              titulo="Assistente de voz"
              descricao="Permite fazer perguntas por voz dizendo 'Farol' ou segurando na tela da câmera."
              valor={config.escutaAtiva}
              onChange={async () => {
                await alternar();
              }}
            />
            <LinhaOpcoes
              titulo="Velocidade da fala"
              opcoes={VELOCIDADES}
              valor={config.velocidadeFala}
              onChange={(v) => {
                atualizar({ velocidadeFala: v });
                falar(`Velocidade ${rotuloDe(VELOCIDADES, v)}`);
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

          {/* ===== Vibração ===== */}
          <Secao titulo="Vibração" estiloSecao={e.secao} estiloTitulo={e.tituloSecao}>
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
          <Secao titulo="Servidor" estiloSecao={e.secao} estiloTitulo={e.tituloSecao}>
            <Text style={e.rotulo}>Endereço do servidor</Text>
            <TextInput
              value={endereco}
              onChangeText={setEndereco}
              onFocus={() => setCampoEmFoco(true)}
              onBlur={() => setCampoEmFoco(false)}
              placeholder={URL_PADRAO || "http://192.168.1.11:8000"}
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
          <Secao titulo="Sobre" estiloSecao={e.secao} estiloTitulo={e.tituloSecao}>
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

function criarEstilos(cores: PaletaCores, altoContraste: boolean) {
  const eClaro = cores.modo === "claro";

  return StyleSheet.create({
    tela: { flex: 1, backgroundColor: cores.fundo },
    topo: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: espaco.md,
      paddingTop: espaco.sm,
      paddingBottom: espaco.sm,
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
      borderWidth: altoContraste ? 2 : eClaro ? 1 : 0,
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
    titulo: {
      color: cores.textoPrincipal,
      fontSize: fonte.titulo,
      fontWeight: "800",
    },
    conteudo: { padding: espaco.lg, gap: espaco.xl, paddingBottom: espaco.xl * 2 },
    secao: { gap: espaco.md },
    tituloSecao: {
      color: cores.luzSuave,
      fontSize: fonte.subtitulo,
      fontWeight: "800",
    },
    rotulo: {
      color: cores.textoPrincipal,
      fontSize: fonte.corpo,
      fontWeight: altoContraste ? "800" : "700",
    },
    campo: {
      minHeight: 60,
      paddingHorizontal: espaco.md,
      borderRadius: raio.md,
      borderWidth: altoContraste ? 3 : 2,
      borderColor: cores.borda,
      backgroundColor: cores.superficie,
      color: cores.textoPrincipal,
      fontSize: fonte.corpo,
    },
    campoFoco: {
      borderColor: eClaro ? cores.luzForte : cores.luz,
    },
    nota: {
      color: cores.textoSecundario,
      fontSize: fonte.pequeno,
      lineHeight: 21,
      fontWeight: altoContraste ? "600" : "400",
    },
    status: {
      color: cores.luzSuave,
      fontSize: fonte.corpo,
      lineHeight: 26,
      fontWeight: "700",
    },
    texto: {
      color: cores.textoSecundario,
      fontSize: fonte.corpo,
      lineHeight: 26,
      fontWeight: altoContraste ? "600" : "400",
    },
  });
}