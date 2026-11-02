import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useEstilos } from "../../hooks/useEstilos";
import { useConfig } from "../../settings/ConfiguracoesContext";
import { espaco, fonte, raio, type PaletaCores } from "../../theme/tema";

type Props = {
  titulo: string;
  aoVoltar: () => void;
};

export function BarraSuperior({ titulo, aoVoltar }: Props) {
  const insets = useSafeAreaInsets();
  const { cores } = useConfig();
  const e = useEstilos(criarEstilos);

  return (
    <View style={[e.barra, { paddingTop: insets.top + espaco.sm }]}>
      <Pressable
        onPress={aoVoltar}
        accessibilityRole="button"
        accessibilityLabel="Voltar ao menu"
        hitSlop={8}
        style={e.voltar}
      >
        <Ionicons name="arrow-back" size={28} color={cores.textoPrincipal} />
      </Pressable>
      <Text accessibilityRole="header" style={e.titulo}>
        {titulo}
      </Text>
    </View>
  );
}

function criarEstilos(cores: PaletaCores, altoContraste: boolean) {
  const eClaro = cores.modo === "claro";

  return StyleSheet.create({
    barra: {
      flexDirection: "row",
      alignItems: "center",
      gap: espaco.md,
      paddingHorizontal: espaco.md,
      paddingBottom: espaco.sm,
      backgroundColor: cores.sobreCamera,
      borderBottomWidth: altoContraste ? 2 : eClaro ? 1.5 : 0,
      borderBottomColor: cores.borda,
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
    titulo: {
      color: cores.textoPrincipal,
      fontSize: fonte.subtitulo,
      fontWeight: "800",
    },
  });
}
