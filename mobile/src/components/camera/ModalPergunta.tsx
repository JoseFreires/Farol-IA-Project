import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useEstilos } from "../../hooks/useEstilos";
import { useConfig } from "../../settings/ConfiguracoesContext";
import { espaco, fonte, raio, type PaletaCores } from "../../theme/tema";
import { Botao } from "../Botao";

const SUGESTOES = [
  "Onde está a mesa?",
  "Há algum risco ou perigo?",
  "O que está à minha frente?",
  "O caminho está livre?",
  "Onde está a cadeira?",
];

type Props = {
  visivel: boolean;
  valorInicial: string; // pergunta já definida, para editar
  rotuloEnviar: string;
  aoEnviar: (texto: string) => void;
  aoDitar: () => void;
  aoFechar: () => void;
};

export function ModalPergunta({
  visivel,
  valorInicial,
  rotuloEnviar,
  aoEnviar,
  aoDitar,
  aoFechar,
}: Props) {
  const { cores } = useConfig();
  const e = useEstilos(criarEstilos);
  const [texto, setTexto] = useState(valorInicial);
  const [visivelAnterior, setVisivelAnterior] = useState(visivel);

  if (visivel !== visivelAnterior) {
    setVisivelAnterior(visivel);
    if (visivel) {
      setTexto(valorInicial);
    }
  }

  return (
    <Modal visible={visivel} transparent animationType="slide" onRequestClose={aoFechar}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={e.fundo}
      >
        <View style={e.conteudo}>
          <View style={e.cabecalho}>
            <Text accessibilityRole="header" style={e.titulo}>
              Pergunta ao Agente
            </Text>
            <Pressable
              onPress={aoFechar}
              accessibilityRole="button"
              accessibilityLabel="Fechar diálogo de pergunta"
              hitSlop={8}
              style={e.fechar}
            >
              <Ionicons name="close" size={24} color={cores.textoPrincipal} />
            </Pressable>
          </View>

          <Text style={e.subtitulo}>
            Pergunte ao agente sobre a localização de objetos, móveis ou riscos no ambiente
            residencial.
          </Text>

          <TextInput
            style={e.campo}
            value={texto}
            onChangeText={setTexto}
            placeholder="Ex: Onde está a mesa? Há algum risco no chão?"
            placeholderTextColor={cores.textoSuave}
            multiline
            numberOfLines={3}
            autoFocus
            returnKeyType="send"
            onSubmitEditing={() => aoEnviar(texto)}
            accessibilityLabel="Campo de pergunta ao agente"
            accessibilityHint="Digite ou use a tecla de microfone do teclado do celular para ditar sua dúvida"
          />

          <View style={e.sugestoes}>
            <Text style={e.sugestoesRotulo}>Perguntas sugeridas:</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={e.sugestoesLista}
            >
              {SUGESTOES.map((sugestao) => (
                <Pressable
                  key={sugestao}
                  onPress={() => setTexto(sugestao)}
                  accessibilityRole="button"
                  accessibilityLabel={`Usar sugestão: ${sugestao}`}
                  style={e.chip}
                >
                  <Text style={e.chipTexto}>{sugestao}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={e.botoes}>
            <Botao
              titulo="Ditar com microfone"
              variante="secundario"
              onPress={aoDitar}
              accessibilityLabel="Ativar microfone para falar a pergunta"
            />
            <Botao
              titulo={rotuloEnviar}
              grande
              desabilitado={!texto.trim()}
              onPress={() => aoEnviar(texto)}
              accessibilityLabel="Confirmar pergunta ao agente"
            />
            <Botao
              titulo="Cancelar"
              variante="secundario"
              onPress={aoFechar}
              accessibilityLabel="Cancelar e fechar"
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function criarEstilos(cores: PaletaCores, altoContraste: boolean) {
  const eClaro = cores.modo === "claro";

  return StyleSheet.create({
    fundo: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.75)", justifyContent: "flex-end" },
    conteudo: {
      gap: espaco.md,
      padding: espaco.lg,
      borderTopLeftRadius: raio.lg,
      borderTopRightRadius: raio.lg,
      backgroundColor: cores.superficie,
      borderWidth: altoContraste ? 3 : eClaro ? 1 : 0,
      borderColor: cores.borda,
    },
    cabecalho: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    titulo: { color: cores.textoPrincipal, fontSize: fonte.titulo, fontWeight: "800" },
    fechar: {
      padding: espaco.xs,
      borderRadius: raio.pill,
      backgroundColor: cores.superficieClara,
      borderWidth: altoContraste ? 2 : 0,
      borderColor: cores.borda,
    },
    subtitulo: {
      color: cores.textoSecundario,
      fontSize: fonte.pequeno,
      lineHeight: 22,
      fontWeight: altoContraste ? "600" : "400",
    },
    campo: {
      minHeight: 84,
      padding: espaco.md,
      borderRadius: raio.md,
      borderWidth: altoContraste ? 3 : 2,
      borderColor: cores.borda,
      backgroundColor: cores.fundo,
      color: cores.textoPrincipal,
      fontSize: fonte.corpo,
      textAlignVertical: "top",
    },
    sugestoes: { gap: espaco.xs },
    sugestoesRotulo: { color: cores.luzSuave, fontSize: fonte.pequeno, fontWeight: "700" },
    sugestoesLista: { gap: espaco.xs },
    chip: {
      paddingHorizontal: espaco.md,
      paddingVertical: espaco.sm,
      borderRadius: raio.pill,
      backgroundColor: cores.superficieClara,
      borderWidth: altoContraste ? 2 : 1,
      borderColor: cores.borda,
    },
    chipTexto: {
      color: cores.textoPrincipal,
      fontSize: fonte.pequeno,
      fontWeight: altoContraste ? "700" : "500",
    },
    botoes: { gap: espaco.sm, marginTop: espaco.xs },
  });
}
