import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Icone } from "../data/funcoes";
import { cores, espaco, fonte, raio } from "../theme/tema";

type Props = {
    titulo: string;
    descricao: string;
    icone: Icone;
    onPress?: () => void;
    emBreve?: boolean;
};

export function CartaoMenu({ titulo, descricao, icone, onPress, emBreve = false }: Props) {
    return (
        <Pressable
            onPress={onPress}
            disabled={emBreve}
            accessibilityRole="button"
            accessibilityLabel={emBreve ? `${titulo}. Em breve.` : `${titulo}. ${descricao}`}
            accessibilityHint={emBreve ? undefined : "Abre a câmera neste modo."}
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
                    color={emBreve ? cores.textoSuave : cores.luz}
                />
            </View>

            <View style={e.textos}>
                <Text style={[e.titulo, emBreve && { color: cores.textoSecundario }]}>{titulo}</Text>
                <Text style={e.descricao}>{descricao}</Text>
            </View>

            {emBreve ? (
                <Text style={e.selo}>Em breve</Text>
            ) : (
                <Ionicons name="chevron-forward" size={26} color={cores.luz} />
            )}
        </Pressable>
    );
}

const e = StyleSheet.create({
    cartao: {
        flexDirection: "row",
        alignItems: "center",
        gap: espaco.md,
        minHeight: 96,
        padding: espaco.md,
        borderRadius: raio.lg,
        backgroundColor: cores.superficie,
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
    },
    textos: { flex: 1, gap: 2 },
    titulo: { color: cores.textoPrincipal, fontSize: fonte.subtitulo, fontWeight: "700" },
    descricao: { color: cores.textoSecundario, fontSize: fonte.pequeno, lineHeight: 21 },
    selo: { color: cores.luzSuave, fontSize: fonte.pequeno, fontWeight: "600" },
});