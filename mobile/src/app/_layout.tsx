import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { ConfiguracoesProvider } from "../settings/ConfiguracoesContext";
import { cores } from "../theme/tema";

export default function Layout() {
  return (
    <ConfiguracoesProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
          contentStyle: { backgroundColor: cores.fundo },
        }}
      />
    </ConfiguracoesProvider>
  );
}