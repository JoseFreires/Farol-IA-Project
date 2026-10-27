import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { Accelerometer } from "expo-sensors";

export type EstadoEstabilidade = "ocioso" | "em_movimento" | "estabilizando" | "disparado";

type OpcoesEstabilidade = {
  ativo: boolean;
  tempoEstabilidadeMs?: number;
  limiarEstavel?: number;
  limiarMovimento?: number;
  onEstabilizando?: () => void;
  onDisparoAutomatico: () => void;
};

export function useEstabilidadeCamera({
  ativo,
  tempoEstabilidadeMs = 1200,
  limiarEstavel = 0.15,
  limiarMovimento = 0.35,
  onEstabilizando,
  onDisparoAutomatico,
}: OpcoesEstabilidade) {
  const [estado, setEstado] = useState<EstadoEstabilidade>("ocioso");

  // Mantém refs para evitar closures desatualizadas nos listeners
  const onEstabilizandoRef = useRef(onEstabilizando);
  onEstabilizandoRef.current = onEstabilizando;

  const onDisparoRef = useRef(onDisparoAutomatico);
  onDisparoRef.current = onDisparoAutomatico;

  const ultimoPonto = useRef<{ x: number; y: number; z: number } | null>(null);
  const inicioEstavel = useRef<number | null>(null);
  const jaDisparou = useRef(false);
  const teveMovimentoPrevio = useRef(false);

  function reiniciar() {
    jaDisparou.current = false;
    inicioEstavel.current = null;
    ultimoPonto.current = null;
    teveMovimentoPrevio.current = false;
    setEstado("ocioso");
  }

  useEffect(() => {
    if (!ativo || Platform.OS === "web") {
      reiniciar();
      return;
    }

    let subscricao: { remove: () => void } | null = null;
    let cancelado = false;

    async function iniciar() {
      const disponivel = await Accelerometer.isAvailableAsync().catch(() => false);
      if (!disponivel || cancelado) return;

      Accelerometer.setUpdateInterval(100);

      subscricao = Accelerometer.addListener(({ x, y, z }) => {
        if (jaDisparou.current) return;

        const agora = Date.now();
        const prev = ultimoPonto.current;
        ultimoPonto.current = { x, y, z };

        if (!prev) return;

        // Variação vetorial instantânea
        const delta = Math.sqrt(
          Math.pow(x - prev.x, 2) + Math.pow(y - prev.y, 2) + Math.pow(z - prev.z, 2)
        );

        // Verifica inclinação: se o celular estiver horizontal (mesa/bolso), evita disparo
        // Quando apontado para a cena, |y| ou inclinação relevante costuma ser > 0.25
        const naHorizontal = Math.abs(z) > 0.96 && Math.abs(y) < 0.2;

        if (delta > limiarMovimento) {
          teveMovimentoPrevio.current = true;
          inicioEstavel.current = null;
          setEstado("em_movimento");
        } else if (delta <= limiarEstavel && !naHorizontal) {
          if (!inicioEstavel.current) {
            inicioEstavel.current = agora;
            setEstado("estabilizando");
            onEstabilizandoRef.current?.();
          } else {
            const duracaoEstavel = agora - inicioEstavel.current;
            if (duracaoEstavel >= tempoEstabilidadeMs && !jaDisparou.current) {
              jaDisparou.current = true;
              setEstado("disparado");
              onDisparoRef.current();
            }
          }
        } else {
          // Zona intermediária entre movimento e estabilidade
          if (inicioEstavel.current && agora - inicioEstavel.current > 400) {
            inicioEstavel.current = null;
            setEstado("em_movimento");
          }
        }
      });
    }

    iniciar();

    return () => {
      cancelado = true;
      subscricao?.remove();
    };
  }, [ativo, tempoEstabilidadeMs, limiarEstavel, limiarMovimento]);

  return {
    estado,
    estaEstabilizando: estado === "estabilizando",
    disparado: estado === "disparado",
    reiniciar,
  };
}
