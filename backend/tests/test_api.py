import cv2
from fastapi.testclient import TestClient

from src.farol.api.servidor import Deps, criar_app
from src.farol.captura import SlotFrame
from src.farol.fila_saida import FilaSaida
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
