import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Botao } from "../components/Botao";
import { CartaoMenu } from "../components/CartaoMenu";
import { Logo } from "../components/Logo";
import { CONFIGURACOES, EM_BREVE, FUNCOES } from "../data/funcoes";
import { useEscuta, type EstadoEscuta } from "../escuta/EscutaContext";
import { cores, espaco, fonte } from "../theme/tema";

const TEXTO_ESTADO: Record<EstadoEscuta, string> = {
  desligada: "Desligado. Ative para chamar o Farol pela voz.",
  iniciando: "Ligando o assistente...",
  ouvindo: "Ouvindo. Diga Farol e faça sua pergunta.",
  erro: "Não foi possível ligar o assistente neste aparelho.",
};

export default function Menu() {
  const { estado, ativa, permissaoNegada, alternar } = useEscuta();

  return (
    <SafeAreaView style={e.tela}>
      <ScrollView contentContainerStyle={e.conteudo} showsVerticalScrollIndicator={false}>
        <View style={e.topo}>
          <Logo size={64} />
          <Text style={e.marca}>Farol</Text>
        </View>

        <View style={e.cabecalho}>
          <Text accessibilityRole="header" style={e.titulo}>
            O que você quer fazer?
          </Text>
          <Text style={e.subtitulo}>Escolha uma função e aponte a câmera.</Text>
        </View>

        <View style={e.lista}>
          {FUNCOES.map((f) => (
            <CartaoMenu
              key={f.modo}
              titulo={f.titulo}
              descricao={f.descricao}
              icone={f.icone}
              onPress={() => router.push({ pathname: "/descrever", params: { modo: f.modo } })}
            />
          ))}
        </View>

        <Text accessibilityRole="header" style={e.secao}>
          Assistente de voz
        </Text>
        <Text accessibilityLiveRegion="polite" style={e.subtitulo}>
          {TEXTO_ESTADO[estado]}
        </Text>
        <Botao
          titulo={ativa ? "Desligar assistente" : "Ativar assistente"}
          variante={ativa ? "secundario" : "primario"}
          onPress={alternar}
          accessibilityHint="Liga ou desliga o microfone para ouvir a palavra Farol"
        />
        {permissaoNegada && (
          <Botao
            titulo="Abrir ajustes do aparelho"
            variante="secundario"
            onPress={() => Linking.openSettings()}
            accessibilityHint="Permita o microfone para o Farol"
          />
        )}

        <Text accessibilityRole="header" style={e.secao}>
          Ajustes
        </Text>
        <CartaoMenu
          titulo={CONFIGURACOES.titulo}
          descricao={CONFIGURACOES.descricao}
          icone={CONFIGURACOES.icone}
          dica="Abre as configurações do aplicativo."
          onPress={() => router.push("/configuracoes")}
        />

        <Text accessibilityRole="header" style={e.secao}>
          Em breve
        </Text>
        <View style={e.lista}>
          {EM_BREVE.map((f) => (
            <CartaoMenu key={f.titulo} titulo={f.titulo} descricao={f.descricao} icone={f.icone} emBreve />
          ))}
        </View>

        <Botao
          titulo="Sair"
          variante="secundario"
          onPress={() => router.replace("/")}
          accessibilityHint="Volta para a tela de acesso"
          style={{ marginTop: espaco.md }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: espaco.lg, gap: espaco.lg },
  topo: { flexDirection: "row", alignItems: "center", gap: espaco.sm },
  marca: { color: cores.textoPrincipal, fontSize: fonte.titulo, fontWeight: "800" },
  cabecalho: { gap: espaco.xs },
  titulo: { color: cores.textoPrincipal, fontSize: fonte.titulo, fontWeight: "800" },
  subtitulo: { color: cores.luzSuave, fontSize: fonte.corpo },
  lista: { gap: espaco.md },
  secao: {
    color: cores.textoSecundario,
    fontSize: fonte.subtitulo,
    fontWeight: "700",
    marginTop: espaco.sm,
  },
});