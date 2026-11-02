import { useCallback, useRef, useState } from "react";

// useState + ref sempre atualizado. A ref serve para ler o valor mais recente dentro de
// callbacks assíncronos (fala, câmera, voz) sem cair em "closure desatualizada".
export function useEstadoRef<T>(inicial: T) {
  const [valor, setValor] = useState(inicial);
  const ref = useRef(inicial);

  const definir = useCallback((novo: T) => {
    ref.current = novo;
    setValor(novo);
  }, []);

  return [valor, definir, ref] as const;
}
