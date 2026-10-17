import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { cores, fonte, raio } from "../theme/tema";

type Props = {
    titulo: string;
    onPress: () => void;
    variante?: "primario" | "secundario";
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
    const primario = variante === "primario";

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
                primario ? e.primario : e.secundario,
                pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                desabilitado && { opacity: 0.5 },
                style,
            ]}
        >
            <Text
                style={[
                    e.texto,
                    grande && { fontSize: 24 },
                    { color: primario ? cores.textoSobreLuz : cores.luz },
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
    primario: { backgroundColor: cores.luz },
    secundario: { borderWidth: 2, borderColor: cores.luz, backgroundColor: "transparent" },
    texto: { fontSize: fonte.subtitulo, fontWeight: "700" },
});