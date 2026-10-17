import * as Haptics from "expo-haptics";

import { obterConfig } from "../settings/atual";

const ativa = () => obterConfig().vibracao;

// Todas as vibrações do app passam por aqui, para a opção "Vibração" valer em tudo
export const vibrar = {
  selecao: () => {
    if (ativa()) Haptics.selectionAsync();
  },
  toque: () => {
    if (ativa()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },
  confirmar: () => {
    if (ativa()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  },
  sucesso: () => {
    if (ativa()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
  erro: () => {
    if (ativa()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  },
};