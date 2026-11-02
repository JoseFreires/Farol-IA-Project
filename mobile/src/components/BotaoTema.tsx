import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet } from "react-native";

import { useEstilos } from "../hooks/useEstilos";
import { useConfig } from "../settings/ConfiguracoesContext";
import { raio, type PaletaCores } from "../theme/tema";

// Botão redondo que alterna entre tema escuro e claro
export function BotaoTema() {
  const { cores, tema, alternarTema } = useConfig();
  const e = useEstilos(criarEstilos);
  const escuro = tema === "escuro";

  return (
    <Pressable
      onPress={alternarTema}
      accessibilityRole="button"
      accessibilityLabel={`Alternar tema. Modo atual: ${escuro ? "escuro" : "claro"}`}
      accessibilityHint={`Toque duas vezes para mudar para o tema ${escuro ? "claro" : "escuro"}`}
      style={e.botao}
    >
      <Ionicons
        name={escuro ? "sunny" : "moon"}
        size={24}
        color={escuro ? cores.luz : cores.textoPrincipal}
      />
    </Pressable>
  );
}

function criarEstilos(cores: PaletaCores, altoContraste: boolean) {
  return StyleSheet.create({
    botao: {
      width: 50,
      height: 50,
      borderRadius: raio.pill,
      backgroundColor: cores.superficie,
      borderWidth: altoContraste ? 3 : 2,
      borderColor: cores.borda,
      justifyContent: "center",
      alignItems: "center",
    },
  });
}
