import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { ConfiguracoesProvider, useConfig } from "../settings/ConfiguracoesContext";

function AppStack() {
  const { cores } = useConfig();

  return (
    <>
      <StatusBar style={cores.statusBar} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
          contentStyle: { backgroundColor: cores.fundo },
        }}
      />
    </>
  );
}

export default function Layout() {
  return (
    <ConfiguracoesProvider>
      <AppStack />
    </ConfiguracoesProvider>
  );
}