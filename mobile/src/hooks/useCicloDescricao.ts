import { useCallback, useEffect, useRef, useState } from "react";
import type { CameraView } from "expo-camera";

import { FUNCAO_DESCREVER } from "../data/funcoes";
import { capturarFoto } from "../services/captura";
import { descreverImagem, mensagemDeErro } from "../services/descricao";
import { calar, dizer } from "../services/dialogo";
import { aguardarFimDaFala } from "../services/fala";
import { vibrar } from "../services/vibracao";
import { obterConfig } from "../settings/atual";
import { useConfig } from "../settings/ConfiguracoesContext";
import { useEstabilidadeCamera } from "./useEstabilidadeCamera";
import { useEstadoRef } from "./useEstadoRef";

// Um ciclo de descrição passa por estas fases, sempre nesta ordem:
//   iniciando   -> câmera ligando
//   orientando  -> app fala "Aponte a câmera..."
//   mirando     -> aguarda o celular ficar parado (ou o toque em "Tirar foto")
//   capturando  -> tira a foto (câmera ainda ligada)
//   processando -> câmera DESLIGADA; foto enviada ao modelo
//   resultado   -> descrição mostrada e falada; aguarda "Farol" para um novo ciclo
export type Fase =
  | "iniciando"
  | "orientando"
  | "mirando"
  | "capturando"
  | "processando"
  | "resultado";

const FASES_COM_CAMERA: readonly Fase[] = ["iniciando", "orientando", "mirando", "capturando"];
const FASES_ANTES_DA_FOTO: readonly Fase[] = ["iniciando", "orientando", "mirando"];

type Opcoes = {
  perguntaInicial?: string; // pergunta dita junto com "Farol" no menu
  monitorPausado?: boolean; // true enquanto um diálogo (ex.: digitar pergunta) está aberto
};

export function useCicloDescricao({ perguntaInicial, monitorPausado = false }: Opcoes) {
  const { config } = useConfig();
  const camera = useRef<CameraView>(null);

  const [fase, definirFase, faseRef] = useEstadoRef<Fase>("iniciando");
  const [pergunta, definirPergunta, perguntaRef] = useEstadoRef<string | null>(
    perguntaInicial?.trim() || null,
  );
  const [resposta, setResposta] = useState("");

  // Número do ciclo em andamento. Ao reiniciar (ou sair da tela) o ciclo anterior é descartado,
  // e qualquer resposta atrasada dele é ignorada.
  const ciclo = useRef(0);

  // Sair da tela cancela tudo e devolve o microfone à escuta
  useEffect(
    () => () => {
      ciclo.current++;
      calar();
    },
    [],
  );

  // Reinicia: desliga a fala, limpa a resposta e liga a câmera de novo
  const iniciar = useCallback(
    (novaPergunta?: string) => {
      ciclo.current++;
      calar();
      setResposta("");
      definirPergunta(novaPergunta?.trim() || null);
      definirFase("iniciando");
    },
    [definirFase, definirPergunta],
  );

  // Chamada pelo CameraView quando a câmera terminou de ligar
  const aoCameraPronta = useCallback(async () => {
    if (faseRef.current !== "iniciando") return;
    const meuCiclo = ciclo.current;
    definirFase("orientando");

    const anotada = perguntaRef.current ? `Pergunta anotada: ${perguntaRef.current}. ` : "";
    await dizer(anotada + FUNCAO_DESCREVER.instrucaoVoz);

    if (meuCiclo === ciclo.current) definirFase("mirando");
  }, [definirFase, faseRef, perguntaRef]);

  // Tira a foto, desliga a câmera, envia ao modelo (com a pergunta, se houver) e fala a resposta
  const capturarEEnviar = useCallback(async () => {
    if (faseRef.current !== "mirando") return; // evita disparo duplo
    const meuCiclo = ciclo.current;
    const aindaValido = () => meuCiclo === ciclo.current;

    definirFase("capturando");
    vibrar.confirmar();

    try {
      const imagemUri = await capturarFoto(camera.current, obterConfig().qualidadeFoto);
      if (!aindaValido()) return;

      definirFase("processando"); // a foto já está salva: pode desligar a câmera
      const perguntaEnviada = perguntaRef.current ?? undefined;
      dizer(perguntaEnviada ? `Consultando sobre: ${perguntaEnviada}` : "Foto capturada. Analisando.");

      const texto = await descreverImagem(imagemUri, perguntaEnviada);
      if (!aindaValido()) return;

      setResposta(texto);
      definirPergunta(null); // a pergunta já foi usada
      definirFase("resultado");
      await dizer(texto);
    } catch (erro) {
      if (!aindaValido()) return;
      console.log("ERRO NA DESCRIÇÃO:", erro);
      vibrar.erro();
      const mensagem = mensagemDeErro(erro);
      setResposta(mensagem);
      definirFase("resultado");
      await dizer(mensagem);
    }
  }, [definirFase, definirPergunta, faseRef, perguntaRef]);

  // Monitor de estabilidade (acelerômetro): só liga em "mirando", com captura automática
  const estabilidade = useEstabilidadeCamera({
    ativo: fase === "mirando" && config.capturaAutomatica && !monitorPausado,
    tempoEstabilidadeMs: 1400,
    limiarEstavel: 0.15,
    limiarMovimento: 0.35,
    onEstabilizando: () => {
      dizer(FUNCAO_DESCREVER.instrucaoEstavel);
    },
    onDisparoAutomatico: async () => {
      await aguardarFimDaFala(2500); // deixa "Mantenha a câmera parada" terminar
      capturarEEnviar();
    },
  });

  // Alguém pediu uma descrição ("Farol", digitou ou ditou uma pergunta)
  const pedir = useCallback(
    (texto?: string) => {
      const q = texto?.trim() || undefined;

      if (faseRef.current === "resultado") {
        iniciar(q); // novo ciclo, com a pergunta se houver
      } else if (FASES_ANTES_DA_FOTO.includes(faseRef.current) && q) {
        definirPergunta(q); // segue junto com a foto que está para ser tirada
        dizer(`Pergunta anotada: ${q}`);
      }
      // "Farol" sem pergunta durante a captura já em andamento, ou foto sendo enviada: ignora
    },
    [definirPergunta, faseRef, iniciar],
  );

  return {
    camera,
    fase,
    cameraLigada: FASES_COM_CAMERA.includes(fase),
    pergunta,
    resposta,
    estabilizando: estabilidade.estaEstabilizando,
    aoCameraPronta,
    iniciar,
    pedir,
    tirarFotoAgora: capturarEEnviar,
    removerPergunta: () => definirPergunta(null),
    repetirResposta: () => dizer(resposta),
  };
}
