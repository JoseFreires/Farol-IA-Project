import threading
import time
from dataclasses import replace

import cv2
import numpy as np
from fastapi.testclient import TestClient

from src.farol.api.servidor import Deps, criar_app
from src.farol.captura import SlotFrame
from src.farol.contratos import ObjetoTratado, Origem
from src.farol.fila_saida import FilaSaida
from src.farol.mensagens import msg_ambiente, msg_resposta
from src.farol.sessao import Sessao


def _app(*, fila_llm=None, skills=None):
    slot = SlotFrame()
    sessao = Sessao()
    return criar_app(
        Deps(
            slot=slot,
            sessao=sessao,
            fila_llm=fila_llm,
            fila_saida=FilaSaida(),
            skills=skills or {},
            cfg={
                "api": {
                    "frame_max_bytes": 2_000_000,
                    "timeout_processamento_s": 1,
                    "timeout_pergunta_s": 1,
                }
            },
            parar=None,
        )
    ), sessao


def _iniciar_processador_frame(app, texto=None, deve_falar=True):
    def processar():
        while True:
            requisicao = app.state.deps.slot.proxima_requisicao()
            if requisicao is not None:
                frame_id, _ = requisicao
                if texto is not None:
                    mensagem = msg_ambiente(texto, None, frame_id)
                    if not deve_falar:
                        mensagem = replace(mensagem, deveFalar=False)
                    app.state.deps.fila_saida.publicar(mensagem)
                app.state.deps.fila_saida.finalizar_frame(frame_id)
                return
            time.sleep(0.005)

    threading.Thread(target=processar, daemon=True).start()


def _jpeg_teste():
    sucesso, buffer = cv2.imencode(
        ".jpg", np.zeros((32, 32, 3), dtype=np.uint8)
    )
    assert sucesso
    return buffer.tobytes()


def test_frame_e_pergunta_rotas():
    app, sessao = _app()
    client = TestClient(app)

    _iniciar_processador_frame(app)
    resp_frame = client.post("/frame", content=_jpeg_teste())
    assert resp_frame.status_code == 204, resp_frame.text
    assert sessao.estado.ultimo_frame is not None

    sessao.atualizar(
        descricao_inicial_feita=True,
        ultimo_json=(
            ObjetoTratado(
                classe_yolo="chair",
                classe_pt="cadeira",
                horizontal="à esquerda",
                distancia="perto",
                area_rel=0.2,
            ),
        ),
    )
    resp_pergunta = client.post("/pergunta", json={"texto": "farol onde está a cadeira"})
    assert resp_pergunta.status_code == 200, resp_pergunta.text
    assert resp_pergunta.json() == {
        "frameId": sessao.estado.ultimo_frame_id,
        "texto": "A cadeira está à esquerda, perto.",
    }


def test_health_retorna_ok():
    app, _ = _app()

    resposta = TestClient(app).get("/health")

    assert resposta.status_code == 200
    assert resposta.json() == {"ok": True}


def test_post_frame_retorna_fala_e_remove_mensagem_da_fila():
    app, _ = _app()
    client = TestClient(app)
    _iniciar_processador_frame(app, "Há uma cadeira à sua direita.")

    resposta = client.post("/frame", content=_jpeg_teste())

    assert resposta.status_code == 200
    assert resposta.json() == {
        "frameId": 1,
        "texto": "Há uma cadeira à sua direita.",
    }
    assert client.get("/saida").json() == {"status": "vazia"}


def test_post_frame_nao_retorna_mensagem_com_deve_falar_falso():
    app, _ = _app()
    client = TestClient(app)
    _iniciar_processador_frame(app, "texto ignorado", deve_falar=False)

    resposta = client.post("/frame", content=_jpeg_teste())

    assert resposta.status_code == 204
    assert resposta.content == b""
    assert client.get("/saida").json() == {"status": "vazia"}


def test_post_frame_retorna_504_se_nao_for_processado_no_prazo():
    app, _ = _app()
    app.state.deps.cfg["api"]["timeout_processamento_s"] = 0.01

    resposta = TestClient(app).post("/frame", content=_jpeg_teste())

    assert resposta.status_code == 504
    assert app.state.deps.slot.proxima_requisicao() is None


def test_pergunta_de_atributo_aguarda_modelo_e_retorna_texto_com_frame_id():
    class FilaLLMStub:
        def enfileirar(self, *args, ao_concluir, **kwargs):
            threading.Thread(
                target=lambda: ao_concluir("A camiseta é azul."),
                daemon=True,
            ).start()

    app, sessao = _app(
        fila_llm=FilaLLMStub(),
        skills={"responder-pergunta": {"name": "responder-pergunta"}},
    )
    sessao.atualizar(
        ultimo_frame=np.zeros((32, 32, 3), dtype=np.uint8),
        ultimo_frame_id=12,
        descricao_inicial_feita=True,
    )

    resposta = TestClient(app).post(
        "/pergunta", json={"texto": "qual a cor da camiseta?"}
    )

    assert resposta.status_code == 200
    assert resposta.json() == {
        "frameId": 12,
        "texto": "A camiseta é azul.",
    }


def test_websocket_frames_ingere_frame():
    app, _ = _app()
    client = TestClient(app)
    codificado, jpeg = cv2.imencode(".jpg", cv2.UMat(32, 32, cv2.CV_8UC3))
    assert codificado

    with client.websocket_connect("/ws/frames") as websocket:
        websocket.send_bytes(jpeg.tobytes())

    assert app.state.deps.slot.ultimo() is not None


def test_saida_api_entrega_mensagem_enfileirada_uma_vez():
    app, _ = _app()
    client = TestClient(app)
    fila_saida = app.state.deps.fila_saida
    fila_saida.publicar(msg_resposta("Há uma escada.", Origem.SOMENTE_YOLO, 7))

    resposta = client.get("/saida")
    assert resposta.status_code == 200
    assert resposta.json()["mensagem"] == "Há uma escada."
    assert resposta.json()["frameId"] == 7
    assert client.get("/saida").json() == {"status": "vazia"}
