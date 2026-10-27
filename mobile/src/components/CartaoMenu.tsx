import { useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Icone } from "../data/funcoes";
import { useConfig } from "../settings/ConfiguracoesContext";
import { espaco, fonte, raio, type PaletaCores } from "../theme/tema";

type Props = {
  titulo: string;
  descricao: string;
  icone: Icone;
  onPress?: () => void;
  emBreve?: boolean;
  dica?: string;
};

export function CartaoMenu({
  titulo,
  descricao,
  icone,
  onPress,
  emBreve = false,
  dica,
}: Props) {
  const { cores, config } = useConfig();
  const e = useMemo(() => criarEstilos(cores, config.altoContraste), [cores, config.altoContraste]);
  const corDestaque = cores.modo === "claro" ? cores.luzForte : cores.luz;

  return (
    <Pressable
      onPress={onPress}
      disabled={emBreve}
      accessibilityRole="button"
      accessibilityLabel={emBreve ? `${titulo}. Em breve.` : `${titulo}. ${descricao}`}
      accessibilityHint={emBreve ? undefined : (dica ?? "Abre a câmera neste modo.")}
      accessibilityState={{ disabled: emBreve }}
      style={({ pressed }) => [
        e.cartao,
        emBreve && e.cartaoEmBreve,
        pressed && { backgroundColor: cores.superficieClara },
      ]}
    >
      <View style={[e.icone, emBreve && { backgroundColor: "transparent" }]}>
        <Ionicons
          name={icone}
          size={30}
          color={emBreve ? cores.textoSuave : corDestaque}
        />
      </View>

      <View style={e.textos}>
        <Text style={[e.titulo, emBreve && { color: cores.textoSecundario }]}>{titulo}</Text>
        <Text style={e.descricao}>{descricao}</Text>
      </View>

      {emBreve ? (
        <Text style={e.selo}>Em breve</Text>
      ) : (
        <Ionicons name="chevron-forward" size={26} color={corDestaque} />
      )}
    </Pressable>
  );
}

function criarEstilos(cores: PaletaCores, altoContraste: boolean) {
  const eClaro = cores.modo === "claro";

  return StyleSheet.create({
    cartao: {
      flexDirection: "row",
      alignItems: "center",
      gap: espaco.md,
      minHeight: 96,
      padding: espaco.md,
      borderRadius: raio.lg,
      backgroundColor: cores.superficie,
      borderWidth: altoContraste ? 3 : eClaro ? 1.5 : 0,
      borderColor: cores.borda,
    },
    cartaoEmBreve: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: cores.borda,
      borderStyle: "dashed",
    },
    icone: {
      width: 56,
      height: 56,
      borderRadius: raio.pill,
      backgroundColor: cores.fundo,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: altoContraste ? 2 : eClaro ? 1 : 0,
      borderColor: cores.borda,
    },
    textos: { flex: 1, gap: 2 },
    titulo: {
      color: cores.textoPrincipal,
      fontSize: fonte.subtitulo,
      fontWeight: altoContraste ? "800" : "700",
    },
    descricao: {
      color: cores.textoSecundario,
      fontSize: fonte.pequeno,
      lineHeight: 21,
      fontWeight: altoContraste ? "600" : "400",
    },
    selo: {
      color: cores.luzSuave,
      fontSize: fonte.pequeno,
      fontWeight: "700",
    },
  });
}