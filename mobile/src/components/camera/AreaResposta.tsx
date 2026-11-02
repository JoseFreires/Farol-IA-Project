import { ScrollView, StyleSheet, Text } from "react-native";

import { useEstilos } from "../../hooks/useEstilos";
import { espaco, fonte, type PaletaCores } from "../../theme/tema";

// Texto grande da descrição (ou do andamento), usado quando a câmera está desligada
export function AreaResposta({ texto }: { texto: string }) {
  const e = useEstilos(criarEstilos);

  return (
    <ScrollView
      style={e.area}
      contentContainerStyle={e.conteudo}
      showsVerticalScrollIndicator={false}
    >
      <Text style={e.texto}>
        {texto}
      </Text>
    </ScrollView>
  );
}

function criarEstilos(cores: PaletaCores, altoContraste: boolean) {
  return StyleSheet.create({
    area: { flex: 1 },
    conteudo: { padding: espaco.lg },
    texto: {
      color: cores.textoPrincipal,
      fontSize: fonte.subtitulo,
      lineHeight: 32,
      fontWeight: altoContraste ? "700" : "500",
    },
  });
}
