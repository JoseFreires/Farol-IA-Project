from __future__ import annotations

import argparse
import logging
import threading
import time
from pathlib import Path

import ollama
import uvicorn
import yaml

from src.farol.captura import SlotFrame, capturar
from src.farol.contexto import texto_eventos_python, vars_ambiente
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
    parser = argparse.ArgumentParser(description="Farol: descrição de ambiente por YOLO + Ollama.")
    parser.add_argument("--fonte", type=str, default="api", help="api, webcam index ou caminho de vídeo")
    parser.add_argument("--config", type=str, default="config/farol.yaml")
    parser.add_argument("--sem-api", action="store_true", help="modo console sem FastAPI (usado para desenvolvimento)")
    parser.add_argument("--frames", type=int, default=0, help="limite de frames para execução em vídeo; 0 = sem limite")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="host da API")
    parser.add_argument("--port", type=int, default=8000, help="porta da API")
    args = parser.parse_args()

    cfg = _ler_cfg(args.config)
    parar = threading.Event()
    slot = SlotFrame()
    sessao = Sessao()
    estado_risco = EstadoRisco()
    skills = carregar(cfg.get("llm", {}).get("pasta_skills", "skills"))
    fila_llm = FilaLLM(chat=ollama.chat)
    fila_saida = FilaSaida()
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
                )
                fila_saida.publicar(msg, interrompe=True)
                print(f"[Risco] {msg.mensagem}")

            cfg_filtro = {**cfg.get("filtro", {}), "largura": frame.shape[1], "altura": frame.shape[0]}
            base = montar_base(bruto, cfg_filtro, cfg_degraus)
            tratados = estabilizador.atualizar(base, cfg.get("mudanca", {}))

            if not sessao.estado.descricao_inicial_feita and not sessao.estado.descricao_em_andamento and tratados:
                sessao.atualizar(descricao_em_andamento=True)
                variaveis = vars_ambiente(
                    tratados, "", [], sessao.estado.riscos_alertados
                )
                revisao = sessao.estado.revisao_contexto

                def ao_concluir(
                    texto: str,
                    frame_id: int = frame_id,
                    revisao: int = revisao,
                ) -> None:
                    if sessao.estado.revisao_contexto != revisao:
                        return
                    print(f"[Farol] {texto}")
                    sessao.atualizar(
                        ultima_descricao=texto,
                        descricao_inicial_feita=True,
                        descricao_em_andamento=False,
                        contexto_invalido=False,
                    )
                    fila_saida.publicar(msg_ambiente(texto, None, frame_id), interrompe=False)

                def ao_erro_inicial(
                    exc: Exception,
                    frame_id: int = frame_id,
                    revisao: int = revisao,
                ) -> None:
                    if sessao.estado.revisao_contexto != revisao:
                        return
                    sessao.atualizar(descricao_em_andamento=False)
                    print(f"[Erro] {exc}")
                    fila_saida.publicar(
                        msg_erro(exc, frame_id=frame_id), interrompe=True
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
                    fila_saida.publicar(
                        msg_erro(exc, frame_id=frame_id), interrompe=True
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
                        ) -> None:
                            if sessao.estado.revisao_contexto != revisao:
                                return
                            print(f"[Mudanca] {texto}")
                            sessao.atualizar(
                                ultima_descricao=texto,
                                contexto_invalido=False,
                                descricao_em_andamento=False,
                            )
                            fila_saida.publicar(msg_ambiente(texto, decisao, frame_id), interrompe=False)

                        def ao_erro_mudanca(
                            exc: Exception,
                            frame_id: int = frame_id,
                            revisao: int = sessao.estado.revisao_contexto,
                        ) -> None:
                            if sessao.estado.revisao_contexto != revisao:
                                return
                            sessao.atualizar(
                                contexto_invalido=True,
                                descricao_em_andamento=False,
                            )
                            print(f"[Erro] {exc}")
                            fila_saida.publicar(
                                msg_erro(exc, frame_id=frame_id),
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
                                if decisao.estado_mudanca is not None:
                                    decisao.estado_mudanca.eventos_pendentes = [
                                        *decisao.eventos,
                                        *decisao.estado_mudanca.eventos_pendentes,
                                    ]
                                    decisao.estado_mudanca.pendente_drastica = True
                                concluir_tarefa()
                        except Exception as exc:
                            concluir_tarefa()
                            sessao.atualizar(
                                contexto_invalido=True,
                                descricao_em_andamento=False,
                            )
                            fila_saida.publicar(
                                msg_erro(exc, frame_id=frame_id), interrompe=True
                            )
                    else:
                        texto = texto_eventos_python(
                            decisao.eventos,
                            decisao.estado_mudanca.classes_inanimadas_anunciadas
                            if decisao.estado_mudanca is not None
                            else set(),
                        )
                        if texto:
                            sessao.atualizar(ultimo_ts_fala=time.time())
                            print(f"[Mudanca] {texto}")
                            fila_saida.publicar(
                                msg_ambiente(texto, decisao, frame_id, origem=Origem.SOMENTE_YOLO),
                                interrompe=False,
                            )

            sessao.atualizar(ultimo_frame_id=frame_id, ultimo_json=tratados, ultimo_frame=frame)
        except Exception as exc:
            print(f"[Erro] {exc}")
            fila_saida.publicar(
                msg_erro(exc, frame_id=frame_id), interrompe=True
            )
        finally:
            fila_saida.finalizar_frame(frame_id)
        time.sleep(0.05)

    if args.sem_api and not args.frames:
        print("[Farol] execução concluída; use Ctrl+C para encerrar.")


if __name__ == "__main__":
    main()
