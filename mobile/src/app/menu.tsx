import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Botao } from "../components/Botao";
import { BotaoTema } from "../components/BotaoTema";
import { CartaoMenu } from "../components/CartaoMenu";
import { LinhaSwitch } from "../components/LinhaSwitch";
import { Logo } from "../components/Logo";
import { AssistenteDeVoz } from "../components/menu/AssistenteDeVoz";
import { CONFIGURACOES, FUNCOES } from "../data/funcoes";
import { useBoasVindasMenu } from "../hooks/useBoasVindasMenu";
import { useChamadaPorVoz } from "../hooks/useChamadaPorVoz";
import { useEstilos } from "../hooks/useEstilos";
import { calar } from "../services/dialogo";
import { falar } from "../services/fala";
import { vibrar } from "../services/vibracao";
import { useConfig } from "../settings/ConfiguracoesContext";
import { espaco, fonte, raio, type PaletaCores } from "../theme/tema";

// Abre a câmera de descrição, já com a pergunta quando ela foi dita junto com "Farol"
function abrirDescricao(pergunta?: string) {
  calar();
  router.push({ pathname: "/camera", params: pergunta ? { pergunta } : {} });
}

export default function Menu() {
  const { config, atualizar } = useConfig();
  const e = useEstilos(criarEstilos);

  useBoasVindasMenu(); // fala como começar ao abrir o menu
  useChamadaPorVoz(abrirDescricao); // "Farol" no menu = botão Descrever

  return (
    <SafeAreaView style={e.tela}>
      <ScrollView contentContainerStyle={e.conteudo} showsVerticalScrollIndicator={false}>
        <View style={e.topo}>
          <View style={e.marcaGrupo}>
            <Logo size={48} />
            <Text style={e.marca}>Farol</Text>
          </View>
          <BotaoTema />
        </View>

        <View style={e.cabecalho}>
          <Text accessibilityRole="header" style={e.titulo}>
            O que você quer fazer?
          </Text>
          <Text style={e.subtitulo}>
            Toque em Descrever ou diga Farol para usar a câmera.
          </Text>
        </View>

        <View style={e.lista}>
          {FUNCOES.map((f) => (
            <CartaoMenu
              key={f.acao}
              titulo={f.titulo}
              descricao={f.descricao}
              icone={f.icone}
              dica="Abre a câmera e descreve em voz alta o que ela vê."
              onPress={() => abrirDescricao()}
            />
          ))}
        </View>

        <AssistenteDeVoz />

        <Text accessibilityRole="header" style={e.secao}>
          Ajustes
        </Text>
        <View style={e.cartaoPreferencia}>
          <LinhaSwitch
            titulo="Captura automática"
            descricao="Tira a foto sozinho quando você mantém a câmera parada. Desligada, a câmera mostra o botão Tirar foto."
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
    topo: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    marcaGrupo: { flexDirection: "row", alignItems: "center", gap: espaco.sm },
    marca: { color: cores.textoPrincipal, fontSize: fonte.titulo, fontWeight: "800" },
    cabecalho: { gap: espaco.xs },
    titulo: { color: cores.textoPrincipal, fontSize: fonte.titulo, fontWeight: "800" },
    subtitulo: {
      color: cores.luzSuave,
      fontSize: fonte.corpo,
      fontWeight: altoContraste ? "700" : "600",
    },
    lista: { gap: espaco.md },
    secao: {
      color: cores.textoPrincipal,
      fontSize: fonte.subtitulo,
      fontWeight: "700",
      marginTop: espaco.xs,
    },
    cartaoPreferencia: {
      padding: espaco.md,
      borderRadius: raio.lg,
      backgroundColor: cores.superficie,
      borderWidth: altoContraste ? 3 : eClaro ? 1.5 : 0,
      borderColor: cores.borda,
    },
    rodape: { gap: espaco.md, marginTop: espaco.sm },
  });
}