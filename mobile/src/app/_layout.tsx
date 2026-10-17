import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { cores } from "../theme/tema";

export default function Layout() {
  return (
    <>
      <StatusBar style="light" />
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