import { StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useEstilos } from "../../hooks/useEstilos";
import { espaco, fonte, type PaletaCores } from "../../theme/tema";
import { Botao } from "../Botao";

type Props = {
  aoPermitir: () => void;
  aoVoltar: () => void;
};

export function PermissaoCamera({ aoPermitir, aoVoltar }: Props) {
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
      <Botao titulo="Permitir câmera" grande onPress={aoPermitir} style={e.botao} />
      <Botao titulo="Voltar ao menu" variante="secundario" onPress={aoVoltar} style={e.botao} />
    </SafeAreaView>
  );
}

function criarEstilos(cores: PaletaCores) {
  return StyleSheet.create({
    tela: { flex: 1, justifyContent: "center", gap: espaco.md, padding: espaco.lg, backgroundColor: cores.fundo },
    titulo: { color: cores.textoPrincipal, fontSize: fonte.titulo, fontWeight: "800" },
    texto: { color: cores.textoSecundario, fontSize: fonte.corpo, lineHeight: 26 },
    botao: { alignSelf: "stretch" },
  });
}
