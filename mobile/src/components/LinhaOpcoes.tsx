import { useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useConfig } from "../settings/ConfiguracoesContext";
import { espaco, fonte, raio, type PaletaCores } from "../theme/tema";

export type Opcao<T extends string> = { valor: T; rotulo: string };

type Props<T extends string> = {
  titulo: string;
  descricao?: string;
  opcoes: Opcao<T>[];
  valor: T;
  onChange: (valor: T) => void;
};

// Escolha única entre poucas opções. Botões em vez de slider: funcionam melhor com leitor de tela.
export function LinhaOpcoes<T extends string>({
  titulo,
  descricao,
  opcoes,
  valor,
  onChange,
}: Props<T>) {
  const { cores, config } = useConfig();
  const e = useMemo(() => criarEstilos(cores, config.altoContraste), [cores, config.altoContraste]);

  return (
    <View style={e.bloco}>
      <Text style={e.titulo}>{titulo}</Text>
      {descricao ? <Text style={e.descricao}>{descricao}</Text> : null}

      <View accessibilityRole="radiogroup" accessibilityLabel={titulo} style={e.opcoes}>
        {opcoes.map((o) => {
          const marcado = o.valor === valor;
          return (
            <Pressable
              key={o.valor || "padrao"}
              onPress={() => onChange(o.valor)}
              accessibilityRole="radio"
              accessibilityLabel={o.rotulo}
              accessibilityState={{ checked: marcado, selected: marcado }}
              style={({ pressed }) => [
                e.opcao,
                marcado && e.opcaoMarcada,
                pressed && !marcado && { backgroundColor: cores.superficieClara },
              ]}
            >
              {marcado ? (
                <Ionicons name="checkmark" size={20} color={cores.textoSobreLuz} />
              ) : null}
              <Text style={[e.rotulo, marcado && e.rotuloMarcado]}>{o.rotulo}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function criarEstilos(cores: PaletaCores, altoContraste: boolean) {
  const eClaro = cores.modo === "claro";

  return StyleSheet.create({
    bloco: { gap: espaco.sm },
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
    opcoes: { flexDirection: "row", flexWrap: "wrap", gap: espaco.sm },
    opcao: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minHeight: 52,
      paddingHorizontal: espaco.md,
      borderRadius: raio.pill,
      borderWidth: altoContraste ? 3 : 2,
      borderColor: cores.borda,
      backgroundColor: eClaro ? cores.superficie : "transparent",
    },
    opcaoMarcada: {
      backgroundColor: cores.luz,
      borderColor: eClaro ? cores.luzForte : cores.luz,
    },
    rotulo: {
      color: cores.textoPrincipal,
      fontSize: fonte.pequeno + 1,
      fontWeight: altoContraste ? "700" : "600",
    },
    rotuloMarcado: {
      color: cores.textoSobreLuz,
      fontWeight: "800",
    },
  });
}