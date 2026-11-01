import { useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Botao } from "../components/Botao";
import { CartaoMenu } from "../components/CartaoMenu";
import { LinhaSwitch } from "../components/LinhaSwitch";
import { Logo } from "../components/Logo";
import { useEscuta, type EstadoEscuta } from "../escuta/EscutaContext";
import { CONFIGURACOES, FUNCOES } from "../data/funcoes";
import { falar } from "../services/fala";
import { vibrar } from "../services/vibracao";
import { useConfig } from "../settings/ConfiguracoesContext";
import { espaco, fonte, raio, type PaletaCores } from "../theme/tema";

const TEXTO_ESTADO: Record<EstadoEscuta, string> = {
  desligada: "Desligado. Ative para chamar o Farol pela voz.",
  iniciando: "Ligando o assistente...",
  ouvindo: "Ouvindo. Diga Farol e faça sua pergunta.",
  erro: "Não foi possível ligar o assistente neste aparelho.",
};

export default function Menu() {
  const { estado, ativa, permissaoNegada, alternar } = useEscuta();
  const { config, cores, tema, alternarTema, atualizar } = useConfig();
  const e = useMemo(() => criarEstilos(cores, config.altoContraste), [cores, config.altoContraste]);

  return (
    <SafeAreaView style={e.tela}>
      <ScrollView contentContainerStyle={e.conteudo} showsVerticalScrollIndicator={false}>
        <View style={e.topo}>
          <View style={e.marcaGrupo}>
            <Logo size={48} />
            <Text style={e.marca}>Farol</Text>
          </View>

          <Pressable
            onPress={alternarTema}
            accessibilityRole="button"
            accessibilityLabel={`Alternar tema. Modo atual: ${tema === "escuro" ? "escuro" : "claro"}`}
            accessibilityHint={`Toque duas vezes para mudar para o tema ${tema === "escuro" ? "claro" : "escuro"}`}
            style={e.botaoTema}
          >
            <Ionicons
              name={tema === "escuro" ? "sunny" : "moon"}
              size={24}
              color={tema === "escuro" ? cores.luz : cores.textoPrincipal}
            />
          </Pressable>
        </View>

        <View style={e.cabecalho}>
          <Text accessibilityRole="header" style={e.titulo}>
            O que você quer fazer?
          </Text>
          <Text style={e.subtitulo}>
            Escolha uma das opções abaixo para abrir a câmera ou configurações.
          </Text>
        </View>

        <View style={e.lista}>
          {FUNCOES.map((f) => (
            <CartaoMenu
              key={f.acao}
              titulo={f.titulo}
              descricao={f.descricao}
              icone={f.icone}
              dica={`Abre a câmera no modo ${f.titulo}.`}
              onPress={() =>
                router.push({
                  pathname: "/camera",
                  params: { acao: f.acao },
                })
              }
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

        {/* Preferência de Captura Automática logo abaixo dos botões */}
        <View style={e.cartaoPreferencia}>
          <LinhaSwitch
            titulo="Captura automática"
            descricao="Orienta por voz e dispara a foto ao manter a câmera parada."
            valor={config.capturaAutomatica}
            onChange={(v) => {
              atualizar({ capturaAutomatica: v });
              vibrar.confirmar();
              falar(v ? "Captura automática ativada" : "Captura automática desativada");
            }}
          />
        </View>

        <View style={e.rodape}>
          <CartaoMenu
            titulo={CONFIGURACOES.titulo}
            descricao={CONFIGURACOES.descricao}
            icone={CONFIGURACOES.icone}
            dica="Abre as configurações do aplicativo."
            onPress={() => router.push("/configuracoes")}
          />

          <Botao
            titulo="Sair"
            variante="perigo"
            onPress={() => router.replace("/")}
            accessibilityHint="Volta para a tela inicial de acesso"
            style={{ marginTop: espaco.sm }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function criarEstilos(cores: PaletaCores, altoContraste: boolean) {
  const eClaro = cores.modo === "claro";

  return StyleSheet.create({
    tela: { flex: 1, backgroundColor: cores.fundo },
    conteudo: { padding: espaco.lg, gap: espaco.lg },
    topo: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    marcaGrupo: {
      flexDirection: "row",
      alignItems: "center",
      gap: espaco.sm,
    },
    marca: {
      color: cores.textoPrincipal,
      fontSize: fonte.titulo,
      fontWeight: "800",
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
    cabecalho: { gap: espaco.xs },
    titulo: {
      color: cores.textoPrincipal,
      fontSize: fonte.titulo,
      fontWeight: "800",
    },
    subtitulo: {
      color: cores.luzSuave,
      fontSize: fonte.corpo,
      fontWeight: altoContraste ? "700" : "600",
    },
    lista: { gap: espaco.md },
    cartaoPreferencia: {
      backgroundColor: cores.superficie,
      padding: espaco.md,
      borderRadius: raio.lg,
      borderWidth: altoContraste ? 3 : eClaro ? 1.5 : 0,
      borderColor: cores.borda,
    },
    rodape: { gap: espaco.md, marginTop: espaco.sm },
  });
}