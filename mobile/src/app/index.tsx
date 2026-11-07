import { Redirect } from "expo-router";

// A tela inicial principal do Farol agora é a câmera contínua
export default function Index() {
  return <Redirect href="/camera" />;
}
