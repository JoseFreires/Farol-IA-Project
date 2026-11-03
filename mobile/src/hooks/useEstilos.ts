import { useMemo } from "react";

import { useConfig } from "../settings/ConfiguracoesContext";
import type { PaletaCores } from "../theme/tema";

// Monta os estilos de um componente a partir do tema atual.
// `fabrica` deve ser uma função de módulo (criarEstilos), para o useMemo não recalcular à toa.
export function useEstilos<T>(fabrica: (cores: PaletaCores, altoContraste: boolean) => T): T {
  const { cores, config } = useConfig();
  return useMemo(() => fabrica(cores, config.altoContraste), [fabrica, cores, config.altoContraste]);
}
