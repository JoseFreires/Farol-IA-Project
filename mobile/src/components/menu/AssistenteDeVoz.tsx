import { Linking, StyleSheet, Text, View } from "react-native";

import { useEscuta, type EstadoEscuta } from "../../escuta/EscutaContext";
import { useEstilos } from "../../hooks/useEstilos";
import { espaco, fonte, type PaletaCores } from "../../theme/tema";
import { Botao } from "../Botao";

const TEXTO_ESTADO: Record<EstadoEscuta, string> = {
  desligada: "Desligado. Ative para chamar o Farol pela voz.",
  iniciando: "Ligando o assistente...",
  ouvindo: "Ouvindo. Diga Farol para descrever, ou Farol e a sua pergunta.",
  erro: "Não foi possível ligar o assistente neste aparelho.",
};

// Seção do menu que liga/desliga a escuta da palavra "Farol"
export function AssistenteDeVoz() {
  const { estado, ativa, permissaoNegada, alternar } = useEscuta();
  const e = useEstilos(criarEstilos);

  return (
    <View style={e.secao}>
      <Text accessibilityRole="header" style={e.titulo}>
        Assistente de voz
      </Text>
      <Text accessibilityLiveRegion="polite" style={e.estado}>
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
    </View>
  );
}

function criarEstilos(cores: PaletaCores, altoContraste: boolean) {
  return StyleSheet.create({
    secao: { gap: espaco.md },
    titulo: {
      color: cores.textoPrincipal,
      fontSize: fonte.subtitulo,
      fontWeight: "700",
      marginTop: espaco.xs,
    },
    estado: {
      color: cores.luzSuave,
      fontSize: fonte.corpo,
      fontWeight: altoContraste ? "700" : "600",
    },
  });
}
