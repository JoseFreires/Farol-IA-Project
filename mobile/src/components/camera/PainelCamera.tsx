import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Fase } from "../../hooks/useCicloDescricao";
import { useEstilos } from "../../hooks/useEstilos";
import { useConfig } from "../../settings/ConfiguracoesContext";
import { espaco, fonte, raio, type PaletaCores } from "../../theme/tema";
import { Botao } from "../Botao";

type Props = {
  fase: Fase;
  cameraLigada: boolean;
  textoStatus: string; // mostrado aqui só com a câmera ligada
  pergunta: string | null;
  capturaManual: boolean; // true = captura automática desligada: mostra "Tirar foto"
  aoEditarPergunta: () => void;
  aoRemoverPergunta: () => void;
  aoTirarFoto: () => void;
  aoTirarOutraFoto: () => void;
  aoOuvirNovamente: () => void;
};

const FASES_DE_MIRA: readonly Fase[] = ["iniciando", "orientando", "mirando"];

export function PainelCamera({
  fase,
  cameraLigada,
  textoStatus,
  pergunta,
  capturaManual,
  aoEditarPergunta,
  aoRemoverPergunta,
  aoTirarFoto,
  aoTirarOutraFoto,
  aoOuvirNovamente,
}: Props) {
  const insets = useSafeAreaInsets();
  const { cores } = useConfig();
  const e = useEstilos(criarEstilos);

  const emMira = FASES_DE_MIRA.includes(fase);
  const emResultado = fase === "resultado";

  // Processando com a câmera desligada: nada a fazer, o texto aparece no corpo da tela
  if (!cameraLigada && !emResultado) return null;

  return (
    <View style={[e.painel, { paddingBottom: insets.bottom + espaco.md }]}>
      {pergunta && !emResultado && (
        <View style={e.badge}>
          <View style={e.badgeTextos}>
            <Text style={e.badgeRotulo}>Pergunta ao agente:</Text>
            <Text style={e.badgeTexto} numberOfLines={1}>
              {pergunta}
            </Text>
          </View>
          <Pressable
            onPress={aoRemoverPergunta}
            accessibilityRole="button"
            accessibilityLabel="Remover pergunta"
            style={e.badgeRemover}
          >
            <Ionicons
              name="close-circle"
              size={22}
              color={cores.modo === "claro" ? cores.luzForte : cores.luz}
            />
          </Pressable>
        </View>
      )}

      {cameraLigada && (
        <ScrollView style={e.areaTexto} showsVerticalScrollIndicator={false}>
          <Text style={e.texto}>
            {textoStatus}
          </Text>
        </ScrollView>
      )}

      {emMira && (
        <View style={e.botoes}>
          <Botao
            titulo={pergunta ? "Alterar pergunta" : "Definir pergunta"}
            variante="secundario"
            onPress={aoEditarPergunta}
            accessibilityHint="Digite ou dite o que o agente deve verificar nesta foto"
          />
          {capturaManual && (
            <Botao
              titulo="Tirar foto"
              grande
              desabilitado={fase !== "mirando"}
              onPress={aoTirarFoto}
              accessibilityHint="Tira a foto e envia ao agente"
            />
          )}
        </View>
      )}

      {emResultado && (
        <View style={e.botoes}>
          <Botao
            titulo="Perguntar ao agente"
            grande
            onPress={aoEditarPergunta}
            accessibilityHint="Digite ou dite uma pergunta e tire uma nova foto"
          />
          <Botao
            titulo="Tirar outra foto"
            variante="secundario"
            onPress={aoTirarOutraFoto}
            accessibilityHint="Liga a câmera de novo para uma nova descrição"
          />
          <Botao
            titulo="Ouvir novamente"
            variante="secundario"
            onPress={aoOuvirNovamente}
            accessibilityHint="Repete a descrição em voz alta"
          />
        </View>
      )}
    </View>
  );
}

function criarEstilos(cores: PaletaCores, altoContraste: boolean) {
  const eClaro = cores.modo === "claro";

  return StyleSheet.create({
    painel: {
      gap: espaco.sm,
      padding: espaco.md,
      borderTopLeftRadius: raio.lg,
      borderTopRightRadius: raio.lg,
      backgroundColor: eClaro ? "rgba(255, 255, 255, 0.96)" : cores.sobreCamera,
      borderTopWidth: altoContraste ? 3 : eClaro ? 1.5 : 0,
      borderTopColor: cores.borda,
    },
    badge: {
      flexDirection: "row",
      alignItems: "center",
      gap: espaco.sm,
      padding: espaco.sm,
      borderRadius: raio.md,
      backgroundColor: cores.superficieClara,
      borderWidth: altoContraste ? 2 : 1,
      borderColor: eClaro ? cores.luzForte : cores.luz,
    },
    badgeTextos: { flex: 1, gap: 2 },
    badgeRotulo: { color: cores.luzSuave, fontSize: fonte.pequeno, fontWeight: "700" },
    badgeTexto: { color: cores.textoPrincipal, fontSize: fonte.corpo, fontWeight: "700" },
    badgeRemover: { padding: espaco.xs },
    areaTexto: { maxHeight: 180 },
    texto: {
      color: cores.textoPrincipal,
      fontSize: fonte.corpo,
      lineHeight: 26,
      fontWeight: altoContraste ? "600" : "500",
    },
    botoes: { gap: espaco.sm },
  });
}
