import cv2
from fastapi.testclient import TestClient

from src.farol.api.servidor import Deps, criar_app
from src.farol.captura import SlotFrame
from src.farol.contratos import Origem
from src.farol.fila_saida import FilaSaida
from src.farol.mensagens import msg_resposta
from src.farol.sessao import Sessao


def _app():
    slot = SlotFrame()
    sessao = Sessao()
    return criar_app(
        Deps(
            slot=slot,
            sessao=sessao,
            fila_llm=None,
            fila_saida=FilaSaida(),
            skills={},
            cfg={"api": {"frame_max_bytes": 2_000_000}},
            parar=None,
        )
    ), sessao


def test_frame_e_pergunta_rotas():
    app, sessao = _app()
    client = TestClient(app)

    cap = cv2.VideoCapture("gravacoes/gravacao01.mp4")
    ok, frame = cap.read()
    cap.release()
    assert ok, "vídeo de exemplo não abriu"

    _, payload = cv2.imencode(".jpg", frame)
    resp_frame = client.post("/frame", content=payload.tobytes())
    assert resp_frame.status_code == 200, resp_frame.text
    assert resp_frame.json() == {"status": "ok"}
    assert sessao.estado.ultimo_frame is not None

    resp_pergunta = client.post("/pergunta", json={"texto": "farol onde está a cadeira"})
    assert resp_pergunta.status_code == 200, resp_pergunta.text
    assert resp_pergunta.json()["status"] == "recebida"


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
