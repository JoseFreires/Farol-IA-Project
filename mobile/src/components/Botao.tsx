import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { useConfig } from "../settings/ConfiguracoesContext";
import { fonte, raio } from "../theme/tema";

type Props = {
    titulo: string;
    onPress: () => void;
    variante?: "primario" | "secundario" | "perigo";
    grande?: boolean;
    desabilitado?: boolean;
    accessibilityLabel?: string;
    accessibilityHint?: string;
    style?: StyleProp<ViewStyle>;
};

export function Botao({
    titulo,
    onPress,
    variante = "primario",
    grande = false,
    desabilitado = false,
    accessibilityLabel,
    accessibilityHint,
    style,
}: Props) {
    const { cores, config } = useConfig();
    const primario = variante === "primario";
    const perigo = variante === "perigo";
    const eModoClaro = cores.modo === "claro";

    // No modo claro, perigo (#B3261E) usa fundo sólido com texto branco (#FFFFFF)
    const perigoSolido = perigo && eModoClaro;

    const corTexto = primario
        ? cores.textoSobreLuz
        : perigoSolido
        ? "#FFFFFF"
        : perigo
        ? cores.coralLuminoso
        : eModoClaro
        ? cores.luzForte
        : cores.luz;

    const estiloVariante: ViewStyle = primario
        ? { backgroundColor: cores.luz }
        : perigoSolido
        ? { backgroundColor: cores.coralLuminoso }
        : perigo
        ? {
            borderWidth: config.altoContraste ? 3 : 2,
            borderColor: cores.coralLuminoso,
            backgroundColor: "transparent",
          }
        : {
            borderWidth: config.altoContraste ? 3 : 2,
            borderColor: eModoClaro ? cores.luzForte : cores.luz,
            backgroundColor: "transparent",
          };

    return (
        <Pressable
            onPress={onPress}
            disabled={desabilitado}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? titulo}
            accessibilityHint={accessibilityHint}
            accessibilityState={{ disabled: desabilitado }}
            style={({ pressed }) => [
                e.base,
                grande ? e.grande : e.normal,
                estiloVariante,
                pressed && {
                    opacity: 0.85,
                    transform: [{ scale: 0.98 }],
                    backgroundColor: perigoSolido
                        ? "#8F1D16"
                        : perigo
                        ? "rgba(255, 107, 107, 0.12)"
                        : undefined,
                },
                desabilitado && { opacity: 0.5 },
                style,
            ]}
        >
            <Text
                style={[
                    e.texto,
                    grande && { fontSize: 24 },
                    {
                        color: corTexto,
                        fontWeight: config.altoContraste ? "800" : "700",
                    },
                ]}
            >
                {titulo}
            </Text>
        </Pressable>
    );
}

const e = StyleSheet.create({
    base: {
        borderRadius: raio.lg,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 20,
    },
    normal: { minHeight: 60 },
    grande: { minHeight: 88 },
    texto: { fontSize: fonte.subtitulo, fontWeight: "700" },
});