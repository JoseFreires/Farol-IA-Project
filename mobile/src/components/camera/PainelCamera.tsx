import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useEstilos } from "../../hooks/useEstilos";
import { espaco, fonte, raio, type PaletaCores } from "../../theme/tema";
import { Botao } from "../Botao";

type Props = {
  ultimaMensagem: string;
  perguntaEmAndamento: string | null;
  ouvindoPergunta: boolean;
  aoFazerPergunta: () => void;
  aoRepetirMensagem: () => void;
};

export function PainelCamera({
  ultimaMensagem,
  perguntaEmAndamento,
  ouvindoPergunta,
  aoFazerPergunta,
  aoRepetirMensagem,
}: Props) {
  const insets = useSafeAreaInsets();
  const e = useEstilos(criarEstilos);

  return (
    <View style={[e.painel, { paddingBottom: insets.bottom + espaco.md }]}>
      {ouvindoPergunta && (
        <View style={e.badgeOuvindo}>
          <Ionicons name="mic" size={20} color="#ef4444" />
          <Text style={e.badgeOuvindoTexto}>
            Ouvindo sua pergunta... (pause por 2 segundos para enviar)
          </Text>
        </View>
      )}

      {perguntaEmAndamento && !ouvindoPergunta && (
        <View style={e.badge}>
          <View style={e.badgeTextos}>
            <Text style={e.badgeRotulo}>Pergunta enviada:</Text>
            <Text style={e.badgeTexto} numberOfLines={2}>
              {perguntaEmAndamento}
            </Text>
          </View>
        </View>
      )}

      <ScrollView style={e.areaTexto} showsVerticalScrollIndicator={false}>
        <Text style={e.texto} accessibilityLiveRegion="polite">
          {ultimaMensagem || "Aponte a câmera para o ambiente. As descrições e alertas serão narrados continuamente."}
        </Text>
      </ScrollView>

      <View style={e.botoes}>
        <Botao
          titulo={ouvindoPergunta ? "Ouvindo pergunta..." : "Fazer pergunta"}
          grande
          variante="primario"
          onPress={aoFazerPergunta}
          accessibilityHint="Abre o painel para fazer uma pergunta digitando ou usando o microfone"
        />

        <Botao
          titulo="Repetir fala"
          variante="secundario"
          onPress={aoRepetirMensagem}
          accessibilityHint="Repete a última narração em voz alta"
        />
      </View>
    </View>
  );
}

function criarEstilos(cores: PaletaCores, altoContraste: boolean) {
  const eClaro = cores.modo === "claro";

  return StyleSheet.create({
    painel: {
      gap: espaco.sm,
      padding: espaco.md,
      borderTopLeftRadius: raio.lg,
      borderTopRightRadius: raio.lg,
      backgroundColor: eClaro ? "rgba(255, 255, 255, 0.96)" : cores.sobreCamera,
      borderTopWidth: altoContraste ? 3 : eClaro ? 1.5 : 0,
      borderTopColor: cores.borda,
    },
    badge: {
      flexDirection: "row",
      alignItems: "center",
      gap: espaco.sm,
      padding: espaco.sm,
      borderRadius: raio.md,
      backgroundColor: cores.superficieClara,
      borderWidth: altoContraste ? 2 : 1,
      borderColor: eClaro ? cores.luzForte : cores.luz,
    },
    badgeOuvindo: {
      flexDirection: "row",
      alignItems: "center",
      gap: espaco.sm,
      padding: espaco.sm,
      borderRadius: raio.md,
      backgroundColor: cores.superficie,
      borderWidth: 2,
      borderColor: "#ef4444",
    },
    badgeOuvindoTexto: {
      flex: 1,
      color: cores.textoPrincipal,
      fontSize: fonte.pequeno,
      fontWeight: "700",
    },
    badgeTextos: { flex: 1, gap: 2 },
    badgeRotulo: { color: cores.luzSuave, fontSize: fonte.pequeno, fontWeight: "700" },
    badgeTexto: { color: cores.textoPrincipal, fontSize: fonte.corpo, fontWeight: "700" },
    areaTexto: { maxHeight: 120 },
    texto: {
      color: cores.textoPrincipal,
      fontSize: fonte.corpo,
      lineHeight: 26,
      fontWeight: altoContraste ? "700" : "600",
    },
    botoes: { gap: espaco.sm, marginTop: espaco.xs },
  });
}
