from __future__ import annotations

import argparse
import logging
import threading
import time
from pathlib import Path

import cv2
import ollama
import uvicorn
import yaml

from src.farol.captura import SlotFrame, capturar
from src.farol.contexto import texto_eventos_python, texto_objetos, vars_ambiente
from src.farol.contratos import Origem
from src.farol.deteccao import DetectorCoco, DetectorDegraus, Percepcao
from src.farol.api.servidor import Deps, criar_app
from src.farol.fila_llm import FilaLLM
from src.farol.fila_saida import FilaSaida
from src.farol.filtro import montar_base
from src.farol.mensagens import msg_ambiente, msg_erro, msg_risco
from src.farol.mudanca.identificar_mudanca import identificar_mudanca
from src.farol.mudanca.estabilizador import Estabilizador
from src.farol.risco.identificar_risco import identificar_risco
from src.farol.risco.trigger import deve_alertar, limpar_antigos, registrar_alerta
from src.farol.sessao import EstadoRisco, Sessao
from src.farol.skills import carregar, executar
from src.farol.visualizacao import EstadoVisualizacao, mostrar_frame


logger = logging.getLogger(__name__)


def _ler_cfg(caminho: str | Path) -> dict:
    with open(caminho, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f) or {}
    return cfg


def _parse_fonte(valor: str | None):
    if valor is None or valor == "api":
        return "api"
    if valor.isdigit():
        return int(valor)
    return valor


def _fim_fala_estimado(texto: str) -> float:
    return time.time() + len(texto) * 0.07


def _expira_ms_informativa(cfg: dict, decisao=None) -> int:
    cfg_mensagens = cfg.get("mensagens", {})
    if decisao is None:
        return int(
            cfg_mensagens.get(
                "expira_ms_descricao_inicial",
                cfg_mensagens.get("expira_ms_informativa", 4000),
            )
        )
    if getattr(decisao, "motivo", None) == "OBJETO_NOVO":
        return int(
            cfg_mensagens.get(
                "expira_ms_objeto_novo",
                cfg_mensagens.get("expira_ms_informativa", 4000),
            )
        )
    return int(cfg_mensagens.get("expira_ms_informativa", 4000))


def _aquecer_modelo(modelo: str) -> None:
    try:
        ollama.chat(
            model=modelo,
            messages=[{"role": "user", "content": "ok"}],
            options={"num_predict": 1},
            keep_alive="30m",
        )
    except Exception:
        logger.exception("aquecimento do modelo falhou modelo=%s", modelo)


def _criar_percepcao(cfg: dict, fila_saida: FilaSaida) -> Percepcao:
    detector_coco = DetectorCoco(cfg.get("yolo", {}))
    cfg_degraus = cfg.get("yolo_degraus", {})
    detector_degraus = None
    if cfg_degraus.get("habilitado", False):
        try:
            detector_degraus = DetectorDegraus(cfg_degraus)
        except Exception:
            logger.exception("Detector de degraus indisponível")
            fila_saida.publicar(
                msg_erro(RuntimeError("Detector de degraus indisponível.")),
                interrompe=True,
            )
    return Percepcao(detector_coco, detector_degraus)


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    parser = argparse.ArgumentParser(description="Farol: descrição de ambiente por YOLO + Ollama.")
    parser.add_argument("--fonte", type=str, default="api", help="api, webcam index ou caminho de vídeo")
    parser.add_argument("--config", type=str, default="config/farol.yaml")
    parser.add_argument("--sem-api", action="store_true", help="modo console sem FastAPI (usado para desenvolvimento)")
    parser.add_argument("--frames", type=int, default=0, help="limite de frames para execução em vídeo; 0 = sem limite")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="host da API")
    parser.add_argument("--port", type=int, default=8000, help="porta da API")
    parser.add_argument(
        "--visualizar",
        action="store_true",
        help="abre uma janela local com os frames analisados e as detecções",
    )
    args = parser.parse_args()
    visualizacao_ativa = args.visualizar
    if visualizacao_ativa:
        logger.info(
            "visualizacao ao vivo ativada; pressione Q ou Esc na janela para fechar"
        )

    cfg = _ler_cfg(args.config)
    logger.info(
        "auditoria backend iniciado fonte=%s api=%s config=%s estabilizador_frames_entrada=%s "
        "estabilizador_frames_saida=%s detector_frames_entrada=1 detector_frames_saida=1 "
        "mudanca_limiar_score=%s mudanca_cooldown_s=%s",
        args.fonte,
        not args.sem_api,
        args.config,
        cfg.get("mudanca", {}).get("frames_para_entrar", 1),
        cfg.get("mudanca", {}).get("frames_para_sair", 1),
        cfg.get("mudanca", {}).get("limiar_score", 0.6),
        cfg.get("mudanca", {}).get("cooldown_informativo_s", 4),
    )
    parar = threading.Event()
    slot = SlotFrame()
    sessao = Sessao()
    estado_risco = EstadoRisco()
    skills = carregar(cfg.get("llm", {}).get("pasta_skills", "skills"))
    modelo_descricao = skills.get("descrever-ambiente", {}).get("model")
    if modelo_descricao:
        threading.Thread(
            target=_aquecer_modelo,
            args=(modelo_descricao,),
            name="T_aquecer_modelo",
            daemon=True,
        ).start()
    fila_llm = FilaLLM(chat=ollama.chat)
    fila_saida = FilaSaida()
    estado_visualizacao = EstadoVisualizacao()
    cfg_degraus = cfg.get("yolo_degraus", {})
    percepcao = _criar_percepcao(cfg, fila_saida)
    estabilizador = Estabilizador()
    servidor = None

    if not args.sem_api:
        app = criar_app(
            Deps(
                slot=slot,
                sessao=sessao,
                fila_llm=fila_llm,
                fila_saida=fila_saida,
                skills=skills,
                cfg=cfg,
                parar=parar,
            )
        )
        servidor = uvicorn.Server(
            uvicorn.Config(app, host=args.host, port=args.port, log_level="info")
        )
        threading.Thread(
            target=servidor.run,
            name="T_api",
            daemon=True,
        ).start()

    if args.sem_api:
        fonte = _parse_fonte(args.fonte)
        if fonte == "api":
            raise ValueError("--sem-api exige --fonte webcam/vídeo")
        th = threading.Thread(target=capturar, args=(fonte, slot, parar), daemon=True)
        th.start()

    contador_frames = 0
    ultimo_frame_id = None
    ultimo_resumo_auditoria = time.monotonic()
    frames_desde_resumo = 0
    processamento_fps = max(
        1.0, float(cfg.get("api", {}).get("processamento_fps", 30))
    )
    intervalo_processamento = 1.0 / processamento_fps
    while not parar.is_set() and (args.frames == 0 or contador_frames < args.frames):
        requisicao = slot.proxima_requisicao()
        if requisicao is not None:
            frame_id, frame = requisicao
        else:
            ultimo = slot.ultimo()
            if ultimo is None:
                time.sleep(0.05)
                continue
            frame_id, frame = ultimo
            if frame_id == ultimo_frame_id:
                time.sleep(0.05)
                continue
        capturado_em = slot.timestamp(frame_id) or time.time()
        inicio_processamento = time.monotonic()
        ultimo_frame_id = frame_id
        contador_frames += 1

        try:
            if contador_frames % 100 == 1:
                limpar_antigos(
                    estado_risco,
                    time.time(),
                    float(cfg.get("risco", {}).get("repetir_apos_s", 10)) * 6,
                )
                sessao.atualizar(riscos_alertados=set(estado_risco.alertados))
            bruto = percepcao.detectar(frame_id, frame)
            cfg_risco = {
                **cfg.get("risco", {}),
                "nomes_pt": cfg_degraus.get("nomes_pt", {}),
            }
            risco_itens = identificar_risco(bruto, cfg_risco)
            for risco in risco_itens:
                fator_aproximacao = float(cfg_risco.get("fator_aproximacao", 1.3))
                repetir_apos_s = float(cfg_risco.get("repetir_apos_s", 10))
                if not deve_alertar(
                    risco.chave,
                    risco.area_rel,
                    time.time(),
                    estado_risco,
                    fator_aproximacao,
                    repetir_apos_s,
                ):
                    continue
                agora_risco = time.time()
                registrar_alerta(estado_risco, risco.chave, risco.area_rel, agora_risco)
                fila_llm.cancelar_tudo()
                sessao.atualizar(
                    contexto_invalido=True,
                    descricao_em_andamento=False,
                    riscos_alertados=set(estado_risco.alertados),
                    revisao_contexto=sessao.estado.revisao_contexto + 1,
                )
                msg = msg_risco(
                    risco,
                    frame_id,
                    expira_ms_risco=int(
                        cfg.get("mensagens", {}).get("expira_ms_risco", 3000)
                    ),
                    capturado_em=capturado_em,
                )
                fila_saida.publicar(msg, interrompe=True)
                estado_visualizacao.registrar_fala(msg.mensagem)
                print(f"[Risco] {msg.mensagem}")

            cfg_filtro = {**cfg.get("filtro", {}), "largura": frame.shape[1], "altura": frame.shape[0]}
            base = montar_base(bruto, cfg_filtro, cfg_degraus)
            if visualizacao_ativa:
                resumo_objetos = texto_objetos(
                    base, sessao.estado.riscos_alertados
                )
                tecla = None
                try:
                    tecla = mostrar_frame(
                        frame,
                        frame_id,
                        bruto,
                        risco_itens,
                        resumo_objetos=resumo_objetos,
                        fala=estado_visualizacao.ultima_fala(),
                    )
                except cv2.error:
                    logger.exception(
                        "visualizacao indisponivel; processamento continuará sem janela"
                    )
                    visualizacao_ativa = False
                    try:
                        cv2.destroyWindow("Farol - analise ao vivo")
                    except cv2.error:
                        logger.debug("janela de visualização não chegou a ser criada")
                if tecla in (ord("q"), 27):
                    visualizacao_ativa = False
                    cv2.destroyWindow("Farol - analise ao vivo")
            tratados = estabilizador.atualizar(base, cfg.get("mudanca", {}))
            logger.debug(
                "auditoria frame_processado frame_id=%d deteccoes=%d objetos_base=%d "
                "objetos_estaveis=%d descricao_inicial_feita=%s",
                frame_id,
                len(bruto),
                len(base),
                len(tratados),
                sessao.estado.descricao_inicial_feita,
            )
            frames_desde_resumo += 1
            agora_resumo = time.monotonic()
            if agora_resumo - ultimo_resumo_auditoria >= 5:
                estado_mudanca = sessao.estado.estado_mudanca
                logger.info(
                    "auditoria processamento resumo frame_id=%d frame_width=%d frame_height=%d "
                    "quadros_processados=%d fps_processamento=%.2f "
                    "deteccoes=%d objetos_base=%d objetos_estaveis=%d descricao_inicial_feita=%s "
                    "descricao_em_andamento=%s objetos_confirmados=%d candidatos=%d "
                    "eventos_pendentes=%d score_pendente=%.3f",
                    frame_id,
                    frame.shape[1],
                    frame.shape[0],
                    frames_desde_resumo,
                    frames_desde_resumo / (agora_resumo - ultimo_resumo_auditoria),
                    len(bruto),
                    len(base),
                    len(tratados),
                    sessao.estado.descricao_inicial_feita,
                    sessao.estado.descricao_em_andamento,
                    len(estado_mudanca.confirmados) if estado_mudanca else 0,
                    len(estado_mudanca.candidatos) if estado_mudanca else 0,
                    len(estado_mudanca.eventos_pendentes) if estado_mudanca else 0,
                    estado_mudanca.score_pendente if estado_mudanca else 0.0,
                )
                frames_desde_resumo = 0
                ultimo_resumo_auditoria = agora_resumo

            if not sessao.estado.descricao_inicial_feita and not sessao.estado.descricao_em_andamento and tratados:
                logger.info(
                    "auditoria descricao_inicial agendada frame_id=%d objetos=%d",
                    frame_id,
                    len(tratados),
                )
                sessao.atualizar(descricao_em_andamento=True)
                variaveis = vars_ambiente(
                    tratados, "", [], sessao.estado.riscos_alertados
                )
                revisao = sessao.estado.revisao_contexto

                def ao_concluir(
                    texto: str,
                    frame_id: int = frame_id,
                    revisao: int = revisao,
                    objetos: int = len(tratados),
                    capturado_em: float = capturado_em,
                ) -> None:
                    if sessao.estado.revisao_contexto != revisao:
                        return
                    logger.info(
                        "auditoria descricao_inicial concluida frame_id=%d objetos=%d mensagem=%r",
                        frame_id,
                        objetos,
                        texto,
                    )
                    print(f"[Farol] {texto}")
                    estado_visualizacao.registrar_fala(texto)
                    sessao.atualizar(
                        ultima_descricao=texto,
                        descricao_inicial_feita=True,
                        descricao_em_andamento=False,
                        contexto_invalido=False,
                        ultimo_ts_fala=_fim_fala_estimado(texto),
                    )
                    fila_saida.publicar(
                        msg_ambiente(
                            texto,
                            None,
                            frame_id,
                            expira_ms_informativa=_expira_ms_informativa(cfg),
                            capturado_em=capturado_em,
                        ),
                        interrompe=False,
                    )

                def ao_erro_inicial(
                    exc: Exception,
                    frame_id: int = frame_id,
                    revisao: int = revisao,
                    capturado_em: float = capturado_em,
                ) -> None:
                    if sessao.estado.revisao_contexto != revisao:
                        return
                    sessao.atualizar(descricao_em_andamento=False)
                    logger.error(
                        "auditoria descricao_inicial falhou frame_id=%d erro=%s",
                        frame_id,
                        exc,
                    )
                    print(f"[Erro] {exc}")
                    estado_visualizacao.registrar_fala(str(exc))
                    fila_saida.publicar(
                        msg_erro(
                            exc, frame_id=frame_id, capturado_em=capturado_em
                        ),
                        interrompe=True,
                    )

                concluir_tarefa = fila_saida.iniciar_tarefa_frame(frame_id)
                try:
                    fila_llm.enfileirar(
                        skills["descrever-ambiente"],
                        variaveis,
                        prioridade=2,
                        modo="",
                        ao_concluir=ao_concluir,
                        ao_erro=ao_erro_inicial,
                        ao_finalizar=concluir_tarefa,
                    )
                except Exception as exc:
                    concluir_tarefa()
                    sessao.atualizar(descricao_em_andamento=False)
                    logger.exception(
                        "auditoria descricao_inicial nao_enfileirada frame_id=%d erro=%s",
                        frame_id,
                        exc,
                    )
                    fila_saida.publicar(
                        msg_erro(
                            exc, frame_id=frame_id, capturado_em=capturado_em
                        ),
                        interrompe=True,
                    )

            if sessao.estado.descricao_inicial_feita:
                cfg_estabilizada = {
                    **cfg.get("mudanca", {}),
                    "frames_para_entrar": 1,
                    "frames_para_sair": 1,
                }
                decisao = identificar_mudanca(
                    tratados, sessao.estado, cfg_estabilizada, time.time()
                )
                if decisao.estado_mudanca is not None:
                    sessao.atualizar(estado_mudanca=decisao.estado_mudanca)
                if decisao.deve_falar and decisao.eventos:
                    logger.info(
                        "auditoria mudanca confirmada frame_id=%d motivo=%s drastica=%s eventos=%s",
                        frame_id,
                        decisao.motivo,
                        decisao.drastica,
                        [
                            {
                                "tipo": evento.tipo,
                                "classe": evento.classe,
                                "classe_yolo": evento.classe_yolo,
                                "regiao": evento.regiao,
                                "distancia": evento.distancia,
                                "quantidade": evento.quantidade,
                            }
                            for evento in decisao.eventos
                        ],
                    )
                if decisao.deve_falar and decisao.eventos:
                    if decisao.deve_chamar_llm:
                        variaveis = vars_ambiente(
                            tratados,
                            sessao.estado.ultima_descricao,
                            decisao.eventos,
                            sessao.estado.riscos_alertados,
                        )

                        def ao_concluir_mudanca(
                            texto: str,
                            frame_id: int = frame_id,
                            decisao=decisao,
                            revisao: int = sessao.estado.revisao_contexto,
                            capturado_em: float = capturado_em,
                        ) -> None:
                            if sessao.estado.revisao_contexto != revisao:
                                return
                            logger.info(
                                "auditoria mudanca descrita frame_id=%d motivo=%s mensagem=%r",
                                frame_id,
                                decisao.motivo,
                                texto,
                            )
                            print(f"[Mudanca] {texto}")
                            estado_visualizacao.registrar_fala(texto)
                            sessao.atualizar(
                                ultima_descricao=texto,
                                contexto_invalido=False,
                                descricao_em_andamento=False,
                                ultimo_ts_fala=_fim_fala_estimado(texto),
                            )
                            fila_saida.publicar(
                                msg_ambiente(
                                    texto,
                                    decisao,
                                    frame_id,
                                    expira_ms_informativa=_expira_ms_informativa(
                                        cfg, decisao
                                    ),
                                    capturado_em=capturado_em,
                                ),
                                interrompe=False,
                            )

                        def ao_erro_mudanca(
                            exc: Exception,
                            frame_id: int = frame_id,
                            decisao=decisao,
                            revisao: int = sessao.estado.revisao_contexto,
                            capturado_em: float = capturado_em,
                        ) -> None:
                            if sessao.estado.revisao_contexto != revisao:
                                return
                            sessao.atualizar(
                                contexto_invalido=True,
                                descricao_em_andamento=False,
                            )
                            logger.error(
                                "auditoria mudanca falhou frame_id=%d motivo=%s erro=%s",
                                frame_id,
                                decisao.motivo,
                                exc,
                            )
                            print(f"[Erro] {exc}")
                            estado_visualizacao.registrar_fala(str(exc))
                            fila_saida.publicar(
                                msg_erro(
                                    exc,
                                    frame_id=frame_id,
                                    capturado_em=capturado_em,
                                ),
                                interrompe=True,
                            )

                        concluir_tarefa = fila_saida.iniciar_tarefa_frame(
                            frame_id
                        )
                        try:
                            if not fila_llm.ocupada_com(2):
                                agora = time.time()
                                sessao.atualizar(
                                    ultimo_ts_fala=agora,
                                    contexto_invalido=False,
                                    descricao_em_andamento=True,
                                )
                                fila_llm.enfileirar(
                                    skills["descrever-ambiente"],
                                    variaveis,
                                    prioridade=2,
                                    modo="atualizacao",
                                    ao_concluir=ao_concluir_mudanca,
                                    ao_erro=ao_erro_mudanca,
                                    ao_finalizar=concluir_tarefa,
                                )
                            else:
                                logger.info(
                                    "auditoria mudanca adiada frame_id=%d motivo=%s motivo_adiamento=fila_llm_ocupada",
                                    frame_id,
                                    decisao.motivo,
                                )
                                if decisao.estado_mudanca is not None:
                                    decisao.estado_mudanca.eventos_pendentes = [
                                        *decisao.eventos,
                                        *decisao.estado_mudanca.eventos_pendentes,
                                    ]
                                    decisao.estado_mudanca.pendente_drastica = True
                                    if decisao.estado_mudanca.primeiro_pendente_ts is None:
                                        decisao.estado_mudanca.primeiro_pendente_ts = time.time()
                                concluir_tarefa()
                        except Exception as exc:
                            concluir_tarefa()
                            sessao.atualizar(
                                contexto_invalido=True,
                                descricao_em_andamento=False,
                            )
                            fila_saida.publicar(
                                msg_erro(
                                    exc,
                                    frame_id=frame_id,
                                    capturado_em=capturado_em,
                                ),
                                interrompe=True,
                            )
                    else:
                        texto = texto_eventos_python(
                            decisao.eventos,
                            decisao.estado_mudanca.classes_inanimadas_anunciadas
                            if decisao.estado_mudanca is not None
                            else set(),
                        )
                        if texto:
                            sessao.atualizar(ultimo_ts_fala=_fim_fala_estimado(texto))
                            logger.info(
                                "auditoria mudanca descrita frame_id=%d motivo=%s origem=python mensagem=%r",
                                frame_id,
                                decisao.motivo,
                                texto,
                            )
                            print(f"[Mudanca] {texto}")
                            estado_visualizacao.registrar_fala(texto)
                            fila_saida.publicar(
                                msg_ambiente(
                                    texto,
                                    decisao,
                                    frame_id,
                                    expira_ms_informativa=_expira_ms_informativa(
                                        cfg, decisao
                                    ),
                                    origem=Origem.SOMENTE_YOLO,
                                    capturado_em=capturado_em,
                                ),
                                interrompe=False,
                            )

            sessao.atualizar(ultimo_frame_id=frame_id, ultimo_json=tratados, ultimo_frame=frame)
        except Exception as exc:
            logger.exception(
                "auditoria frame_processamento falhou frame_id=%s erro=%s",
                frame_id,
                exc,
            )
            print(f"[Erro] {exc}")
            estado_visualizacao.registrar_fala(str(exc))
            fila_saida.publicar(
                msg_erro(
                    exc, frame_id=frame_id, capturado_em=capturado_em
                ),
                interrompe=True,
            )
        finally:
            fila_saida.finalizar_frame(frame_id)
        restante = intervalo_processamento - (
            time.monotonic() - inicio_processamento
        )
        if restante > 0:
            time.sleep(restante)
    if visualizacao_ativa:
        cv2.destroyWindow("Farol - analise ao vivo")

    if args.sem_api and not args.frames:
        print("[Farol] execução concluída; use Ctrl+C para encerrar.")


if __name__ == "__main__":
    main()
