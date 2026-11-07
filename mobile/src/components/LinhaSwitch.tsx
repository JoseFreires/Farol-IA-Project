import { useMemo } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { useConfig } from "../settings/ConfiguracoesContext";
import { espaco, fonte, type PaletaCores } from "../theme/tema";

type Props = {
  titulo: string;
  descricao?: string;
  valor: boolean;
  onChange: (valor: boolean) => void;
};

// A linha inteira é o controle (alvo de toque grande). O Switch visual fica escondido
// do leitor de tela para não ser anunciado duas vezes.
export function LinhaSwitch({ titulo, descricao, valor, onChange }: Props) {
  const { cores, config } = useConfig();
  const e = useMemo(() => criarEstilos(cores, config.altoContraste), [cores, config.altoContraste]);

  return (
    <Pressable
      onPress={() => onChange(!valor)}
      accessibilityRole="switch"
      accessibilityLabel={titulo}
      accessibilityHint={descricao}
      accessibilityState={{ checked: valor }}
      style={e.linha}
    >
      <View style={e.textos}>
        <Text style={e.titulo}>{titulo}</Text>
        {descricao ? <Text style={e.descricao}>{descricao}</Text> : null}
      </View>

      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Switch
          value={valor}
          onValueChange={onChange}
          trackColor={{
            false: cores.modo === "claro" ? "#CAD8E8" : cores.borda,
            true: cores.luz,
          }}
          thumbColor={
            valor
              ? cores.textoSobreLuz
              : cores.modo === "claro"
              ? "#829AB8"
              : "#8FA5C4"
          }
          ios_backgroundColor={cores.modo === "claro" ? "#CAD8E8" : cores.borda}
        />
      </View>
    </Pressable>
  );
}

function criarEstilos(cores: PaletaCores, altoContraste: boolean) {
  return StyleSheet.create({
    linha: {
      flexDirection: "row",
      alignItems: "center",
      gap: espaco.md,
      minHeight: 64,
    },
    textos: { flex: 1, gap: 2 },
    titulo: {
      color: cores.textoPrincipal,
      fontSize: fonte.corpo,
      fontWeight: altoContraste ? "800" : "700",
    },
    descricao: {
      color: cores.textoSecundario,
      fontSize: fonte.pequeno,
      lineHeight: 21,
      fontWeight: altoContraste ? "600" : "400",
    },
  });
}