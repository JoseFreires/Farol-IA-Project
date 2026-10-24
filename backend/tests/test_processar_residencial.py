import base64
import os

os.environ.setdefault("APP_TOKEN", "test-token")

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


VALIDA_BASE64 = base64.b64encode(b"fake-image-data").decode("ascii")


def _headers():
    return {"Authorization": "Bearer test-token"}


def test_processar_primeira_descricao_fala():
    resp = client.post(
        "/processar",
        headers=_headers(),
        json={
            "sessionId": "sess-01",
            "contexto": "RESIDENCIAL",
            "imagemBase64": VALIDA_BASE64,
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["sessionId"] == "sess-01"
    assert body["contexto"] == "RESIDENCIAL"
    assert body["deveFalar"] is True
    assert "sala" in body["mensagem"].lower()


def test_processar_segunda_chamada_sem_necessidade_nao_fala():
    resp = client.post(
        "/processar",
        headers=_headers(),
        json={
            "sessionId": "sess-01",
            "contexto": "RESIDENCIAL",
            "imagemBase64": VALIDA_BASE64,
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["deveFalar"] is False
    assert body["mensagem"] is None


def test_processar_pergunta_responde():
    resp = client.post(
        "/processar",
        headers=_headers(),
        json={
            "sessionId": "sess-02",
            "contexto": "RESIDENCIAL",
            "imagemBase64": VALIDA_BASE64,
            "pergunta": "Onde está a mesa?",
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["deveFalar"] is True
    assert "mesa" in body["mensagem"].lower()


def test_processar_imagem_invalida():
    resp = client.post(
        "/processar",
        headers=_headers(),
        json={
            "sessionId": "sess-03",
            "contexto": "RESIDENCIAL",
            "imagemBase64": "nao-e-base64",
        },
    )

    assert resp.status_code == 400
