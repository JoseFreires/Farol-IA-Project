import base64
import io
import os

import pytest
from PIL import Image

os.environ.setdefault("APP_TOKEN", "test-token")

from fastapi.testclient import TestClient

from app.main import app
from app.processor import Processor
from rules.rules import AnalysisData

client = TestClient(app)


class RuntimeDeTeste:
    async def processar(self, solicitacao, memoria):
        if solicitacao.pergunta:
            return AnalysisData(
                session_id=solicitacao.session_id,
                resposta_semantica="A mesa aparece à direita.",
                confianca_geral=0.9,
            )
        return AnalysisData(
            session_id=solicitacao.session_id,
            descricao="Uma sala com uma janela ao fundo.",
            confianca_geral=0.9,
        )


class RuntimeComFalha:
    async def processar(self, solicitacao, memoria):
        raise RuntimeError("Falha do runtime")


class RuntimeCapturandoSkill:
    def __init__(self):
        self.skill_override = None

    async def processar(self, solicitacao, memoria):
        self.skill_override = solicitacao.skill_override
        return AnalysisData(
            session_id=solicitacao.session_id,
            descricao="Uma sala com uma janela ao fundo.",
            confianca_geral=0.9,
        )


@pytest.fixture(autouse=True)
def processor_de_teste():
    app.state.processor = Processor(runtime=RuntimeDeTeste())


def test_rotas_legadas_nao_sao_expostas():
    caminhos = {rota.path for rota in app.routes}

    assert "/descrever" not in caminhos
    assert "/boleto/validar" not in caminhos


def _imagem_base64():
    buffer = io.BytesIO()
    Image.new("RGB", (64, 64), "white").save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


VALIDA_BASE64 = _imagem_base64()


def _headers():
    return {"Authorization": "Bearer test-token"}


def test_processar_primeira_descricao_fala():
    resp = client.post(
        "/processar",
        headers=_headers(),
        json={
            "sessionId": "sess-01",
            "imagemBase64": VALIDA_BASE64,
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["sessionId"] == "sess-01"
    assert "contexto" not in body
    assert body["deveFalar"] is True
    assert body["mensagem"] == "Uma sala com uma janela ao fundo."


def test_primeira_chamada_seleciona_descricao_do_ambiente():
    runtime = RuntimeCapturandoSkill()
    app.state.processor = Processor(runtime=runtime)

    resp = client.post(
        "/processar",
        headers=_headers(),
        json={
            "sessionId": "sess-primeira-descricao",
            "imagemBase64": VALIDA_BASE64,
        },
    )

    assert resp.status_code == 200
    assert runtime.skill_override == "describe-environment"


def test_contexto_legado_e_ignorado():
    resp = client.post(
        "/processar",
        headers=_headers(),
        json={
            "sessionId": "sess-legacy-context",
            "contexto": "RESIDENCIAL",
            "imagemBase64": VALIDA_BASE64,
        },
    )

    assert resp.status_code == 200
    assert "contexto" not in resp.json()


def test_processar_segunda_chamada_sem_necessidade_nao_fala():
    primeira = client.post(
        "/processar",
        headers=_headers(),
        json={
            "sessionId": "sess-01",
            "imagemBase64": VALIDA_BASE64,
        },
    )
    assert primeira.status_code == 200

    resp = client.post(
        "/processar",
        headers=_headers(),
        json={
            "sessionId": "sess-01",
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
            "imagemBase64": VALIDA_BASE64,
            "pergunta": "Onde está a mesa?",
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["deveFalar"] is True
    assert body["mensagem"] == "A mesa aparece à direita."


def test_processar_imagem_invalida():
    resp = client.post(
        "/processar",
        headers=_headers(),
        json={
            "sessionId": "sess-03",
            "imagemBase64": "nao-e-base64",
        },
    )

    assert resp.status_code == 400


def test_falha_de_runtime_nao_retorna_descricao_fallback():
    app.state.processor = Processor(runtime=RuntimeComFalha())

    resp = client.post(
        "/processar",
        headers=_headers(),
        json={
            "sessionId": "sess-04",
            "imagemBase64": VALIDA_BASE64,
        },
    )

    assert resp.status_code == 500
    assert resp.json()["detail"] == "Erro ao processar a solicitação"
