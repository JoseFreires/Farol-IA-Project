import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Botao } from "../components/Botao";
import { Logo } from "../components/Logo";
import { cores, espaco, fonte, raio } from "../theme/tema";

type Campo = "email" | "senha" | null;

export default function Acesso() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [foco, setFoco] = useState<Campo>(null);
  const senhaRef = useRef<TextInput>(null);

  function entrar() {
    // TODO: autenticação. Por enquanto o acesso é livre e os campos não são validados.
    router.replace("/menu");
  }

  return (
    <SafeAreaView style={e.tela}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={e.conteudo}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={e.marca}>
            <Logo size={168} />
            <Text accessibilityRole="header" style={e.nome}>
              Farol
            </Text>
            <Text style={e.lema}>Seu mundo, descrito em voz alta.</Text>
          </View>

          <View style={e.formulario}>
            <Text style={e.rotulo}>E-mail</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              onFocus={() => setFoco("email")}
              onBlur={() => setFoco(null)}
              placeholder="voce@exemplo.com"
              placeholderTextColor={cores.textoSuave}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              returnKeyType="next"
              onSubmitEditing={() => senhaRef.current?.focus()}
              accessibilityLabel="E-mail"
              style={[e.campo, foco === "email" && e.campoFoco]}
            />

            <Text style={e.rotulo}>Senha</Text>
            <TextInput
              ref={senhaRef}
              value={senha}
              onChangeText={setSenha}
              onFocus={() => setFoco("senha")}
              onBlur={() => setFoco(null)}
              placeholder="Sua senha"
              placeholderTextColor={cores.textoSuave}
              secureTextEntry
              autoCapitalize="none"
              returnKeyType="go"
              onSubmitEditing={entrar}
              accessibilityLabel="Senha"
              style={[e.campo, foco === "senha" && e.campoFoco]}
            />

            <Botao
              titulo="Entrar"
              grande
              onPress={entrar}
              accessibilityHint="Abre o menu de funções"
              style={{ marginTop: espaco.md }}
            />

            <Text style={e.aviso}>
              Versão de testes: o acesso ainda não pede senha. Toque em Entrar para continuar.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: {
    flexGrow: 1,
    justifyContent: "center",
    padding: espaco.lg,
    gap: espaco.xl,
  },
  marca: { alignItems: "center", gap: espaco.sm },
  nome: {
    color: cores.textoPrincipal,
    fontSize: fonte.marca,
    fontWeight: "800",
    letterSpacing: 1,
  },
  lema: { color: cores.luzSuave, fontSize: fonte.corpo, textAlign: "center" },
  formulario: { gap: espaco.sm },
  rotulo: {
    color: cores.textoPrincipal,
    fontSize: fonte.corpo,
    fontWeight: "600",
    marginTop: espaco.sm,
  },
  campo: {
    minHeight: 60,
    paddingHorizontal: espaco.md,
    borderRadius: raio.md,
    borderWidth: 2,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
    color: cores.textoPrincipal,
    fontSize: fonte.corpo,
  },
  campoFoco: { borderColor: cores.luz },
  aviso: {
    color: cores.textoSecundario,
    fontSize: fonte.pequeno,
    lineHeight: 21,
    textAlign: "center",
    marginTop: espaco.sm,
  },
});