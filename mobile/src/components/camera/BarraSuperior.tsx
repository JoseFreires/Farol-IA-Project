import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useEstilos } from "../../hooks/useEstilos";
import type { StatusTransmissao } from "../../services/transmissao";
import { useConfig } from "../../settings/ConfiguracoesContext";
import { espaco, fonte, raio, type PaletaCores } from "../../theme/tema";

type Props = {
  titulo: string;
  statusTransmissao?: StatusTransmissao;
  aoConfigurar?: () => void;
  aoVoltar?: () => void;
};

export function BarraSuperior({ titulo, statusTransmissao = "transmitindo", aoConfigurar, aoVoltar }: Props) {
  const insets = useSafeAreaInsets();
  const { cores } = useConfig();
  const e = useEstilos(criarEstilos);

  const corStatus = {
    transmitindo: "#22c55e",
    conectando: "#eab308",
    desconectado: cores.textoSuave,
    erro: "#ef4444",
  }[statusTransmissao];

  const textoStatus = {
    transmitindo: "Ao vivo",
    conectando: "Conectando...",
    desconectado: "Pausado",
    erro: "Sem conexão",
  }[statusTransmissao];

  return (
    <View style={[e.barra, { paddingTop: insets.top + espaco.sm }]}>
      {aoVoltar ? (
        <Pressable
          onPress={aoVoltar}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          hitSlop={8}
          style={e.botao}
        >
          <Ionicons name="arrow-back" size={26} color={cores.textoPrincipal} />
        </Pressable>
      ) : null}

      <View style={e.tituloContainer}>
        <Text accessibilityRole="header" style={e.titulo}>
          {titulo}
        </Text>
        <View style={e.statusBadge}>
          <View style={[e.pontoStatus, { backgroundColor: corStatus }]} />
          <Text style={e.statusTexto}>{textoStatus}</Text>
        </View>
      </View>

      {aoConfigurar ? (
        <Pressable
          onPress={aoConfigurar}
          accessibilityRole="button"
          accessibilityLabel="Abrir configurações"
          accessibilityHint="Abre a tela de ajustes de voz e servidor"
          hitSlop={8}
          style={e.botao}
        >
          <Ionicons name="settings-outline" size={26} color={cores.textoPrincipal} />
        </Pressable>
      ) : null}
    </View>
  );
}

function criarEstilos(cores: PaletaCores, altoContraste: boolean) {
  const eClaro = cores.modo === "claro";

  return StyleSheet.create({
    barra: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: espaco.sm,
      paddingHorizontal: espaco.md,
      paddingBottom: espaco.sm,
      backgroundColor: cores.sobreCamera,
      borderBottomWidth: altoContraste ? 2 : eClaro ? 1.5 : 0,
      borderBottomColor: cores.borda,
    },
    tituloContainer: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: espaco.sm,
    },
    titulo: {
      color: cores.textoPrincipal,
      fontSize: fonte.subtitulo,
      fontWeight: "800",
    },
    statusBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: cores.superficie,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: raio.pill,
      borderWidth: altoContraste ? 1.5 : 1,
      borderColor: cores.borda,
    },
    pontoStatus: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    statusTexto: {
      color: cores.textoPrincipal,
      fontSize: fonte.pequeno,
      fontWeight: "700",
    },
    botao: {
      width: 48,
      height: 48,
      borderRadius: raio.pill,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: cores.superficie,
      borderWidth: altoContraste ? 2 : eClaro ? 1.5 : 0,
      borderColor: cores.borda,
    },
  });
}
