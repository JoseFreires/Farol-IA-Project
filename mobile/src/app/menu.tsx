import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Botao } from "../components/Botao";
import { CartaoMenu } from "../components/CartaoMenu";
import { Logo } from "../components/Logo";
import { EM_BREVE, FUNCOES } from "../data/funcoes";
import { cores, espaco, fonte } from "../theme/tema";

export default function Menu() {
    return (
        <SafeAreaView style={e.tela}>
            <ScrollView contentContainerStyle={e.conteudo} showsVerticalScrollIndicator={false}>
                <View style={e.topo}>
                    <Logo size={64} />
                    <Text style={e.marca}>Farol</Text>
                </View>

                <View style={e.cabecalho}>
                    <Text accessibilityRole="header" style={e.titulo}>
                        O que você quer fazer?
                    </Text>
                    <Text style={e.subtitulo}>Escolha uma função e aponte a câmera.</Text>
                </View>

                <View style={e.lista}>
                    {FUNCOES.map((f) => (
                        <CartaoMenu
                            key={f.modo}
                            titulo={f.titulo}
                            descricao={f.descricao}
                            icone={f.icone}
                            onPress={() => router.push({ pathname: "/descrever", params: { modo: f.modo } })}
                        />
                    ))}
                </View>

                <Text accessibilityRole="header" style={e.secao}>
                    Em breve
                </Text>
                <View style={e.lista}>
                    {EM_BREVE.map((f) => (
                        <CartaoMenu key={f.titulo} titulo={f.titulo} descricao={f.descricao} icone={f.icone} emBreve />
                    ))}
                </View>

                <Botao
                    titulo="Sair"
                    variante="secundario"
                    onPress={() => router.replace("/")}
                    accessibilityHint="Volta para a tela de acesso"
                    style={{ marginTop: espaco.md }}
                />
            </ScrollView>
        </SafeAreaView>
    );
}

const e = StyleSheet.create({
    tela: { flex: 1, backgroundColor: cores.fundo },
    conteudo: { padding: espaco.lg, gap: espaco.lg },
    topo: { flexDirection: "row", alignItems: "center", gap: espaco.sm },
    marca: { color: cores.textoPrincipal, fontSize: fonte.titulo, fontWeight: "800" },
    cabecalho: { gap: espaco.xs },
    titulo: { color: cores.textoPrincipal, fontSize: fonte.titulo, fontWeight: "800" },
    subtitulo: { color: cores.luzSuave, fontSize: fonte.corpo },
    lista: { gap: espaco.md },
    secao: {
        color: cores.textoSecundario,
        fontSize: fonte.subtitulo,
        fontWeight: "700",
        marginTop: espaco.sm,
    },
});