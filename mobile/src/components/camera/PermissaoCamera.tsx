import { StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useEstilos } from "../../hooks/useEstilos";
import { espaco, fonte, type PaletaCores } from "../../theme/tema";
import { Botao } from "../Botao";

type Props = {
  aoPermitir: () => void | Promise<void>;
  aoVoltar: () => void;
  precisaAbrirConfiguracoes?: boolean;
  carregando?: boolean;
  erro?: string | null;
};

export function PermissaoCamera({
  aoPermitir,
  aoVoltar,
  precisaAbrirConfiguracoes = false,
  carregando = false,
  erro,
}: Props) {
  const e = useEstilos(criarEstilos);

  return (
    <SafeAreaView style={e.tela}>
      <Text accessibilityRole="header" style={e.titulo}>
        Câmera necessária
      </Text>
      <Text style={e.texto}>
        O Farol precisa da câmera para capturar e orientar você por voz. Nenhuma foto é
        compartilhada sem sua autorização.
      </Text>
      {precisaAbrirConfiguracoes && (
        <Text style={e.texto}>
          O acesso foi bloqueado pelo sistema. Abra as configurações do aplicativo e permita o
          acesso à câmera.
        </Text>
      )}
      {erro ? <Text style={e.erro}>{erro}</Text> : null}
      <Botao
        titulo={
          carregando
            ? "Aguardando..."
            : precisaAbrirConfiguracoes
              ? "Abrir configurações"
              : "Permitir câmera"
        }
        accessibilityHint={
          precisaAbrirConfiguracoes
            ? "Abre as configurações do aplicativo para permitir o acesso à câmera"
            : "Solicita acesso à câmera"
        }
        grande
        desabilitado={carregando}
        onPress={() => {
          void aoPermitir();
        }}
        style={e.botao}
      />
      <Botao titulo="Voltar ao menu" variante="secundario" onPress={aoVoltar} style={e.botao} />
    </SafeAreaView>
  );
}

function criarEstilos(cores: PaletaCores) {
  return StyleSheet.create({
    tela: { flex: 1, justifyContent: "center", gap: espaco.md, padding: espaco.lg, backgroundColor: cores.fundo },
    titulo: { color: cores.textoPrincipal, fontSize: fonte.titulo, fontWeight: "800" },
    texto: { color: cores.textoSecundario, fontSize: fonte.corpo, lineHeight: 26 },
    erro: { color: cores.coralLuminoso, fontSize: fonte.corpo, lineHeight: 26 },
    botao: { alignSelf: "stretch" },
  });
}
