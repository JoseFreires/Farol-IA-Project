import { Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { cores, espaco, fonte } from "../theme/tema";

type Props = {
  titulo: string;
  descricao?: string;
  valor: boolean;
  onChange: (valor: boolean) => void;
};

// A linha inteira é o controle (alvo de toque grande). O Switch visual fica escondido
// do leitor de tela para não ser anunciado duas vezes.
export function LinhaSwitch({ titulo, descricao, valor, onChange }: Props) {
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
          trackColor={{ false: cores.borda, true: cores.luz }}
          thumbColor={cores.textoPrincipal}
          ios_backgroundColor={cores.borda}
        />
      </View>
    </Pressable>
  );
}

const e = StyleSheet.create({
  linha: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco.md,
    minHeight: 64,
  },
  textos: { flex: 1, gap: 2 },
  titulo: { color: cores.textoPrincipal, fontSize: fonte.corpo, fontWeight: "700" },
  descricao: { color: cores.textoSecundario, fontSize: fonte.pequeno, lineHeight: 21 },
});