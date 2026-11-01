import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { EscutaProvider } from "../escuta/EscutaContext";
import { ConfiguracoesProvider } from "../settings/ConfiguracoesContext";
import { cores } from "../theme/tema";

export default function Layout() {
  return (
    <ConfiguracoesProvider>
      <EscutaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
          contentStyle: { backgroundColor: cores.fundo },
        }}
      />
      </EscutaProvider>
    </ConfiguracoesProvider>
  );
}