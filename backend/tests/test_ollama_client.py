import asyncio
import base64
import json
from pathlib import Path

import httpx
import pytest

from agent_runtime.exceptions import OllamaSchemaValidationError
from agent_runtime.models import MarkdownDefinition, SkillExecutionRequest
from agent_runtime.ollama_client import OllamaClient, OllamaConfig
from agent_runtime.ollama_skill_executor import OllamaSkillExecutor
from agent_runtime.runtime import MudancaResultado


def test_ollama_recebe_imagem_anterior_antes_da_atual(monkeypatch):
    requests = []

    async def responder(request):
        requests.append(json.loads(request.content))
        return httpx.Response(200, json={"message": {"content": "{}"}})

    original_async_client = httpx.AsyncClient

    def criar_cliente(*, timeout):
        return original_async_client(
            transport=httpx.MockTransport(responder),
            timeout=timeout,
        )

    monkeypatch.setattr("agent_runtime.ollama_client.httpx.AsyncClient", criar_cliente)
    client = OllamaClient(OllamaConfig(base_url="http://ollama.test"))

    asyncio.run(
        client.analyze_image(
            image=b"imagem-atual",
            previous_image=b"imagem-anterior",
            system_instructions="Compare as imagens.",
            input_data={},
            output_schema={},
            correlation_id="sessao-teste",
        )
    )

    payload = requests[0]
    user_message = payload["messages"][1]
    assert user_message["images"] == [
        base64.b64encode(b"imagem-anterior").decode("utf-8"),
        base64.b64encode(b"imagem-atual").decode("utf-8"),
    ]
    assert "primeiro a imagem anterior, depois a imagem atual" in user_message["content"]


def test_executor_envia_schema_estrito_e_valida_mudanca():
    class ClienteFalso:
        schema = None

        async def analyze_image(self, **kwargs):
            self.schema = kwargs["output_schema"]
            return json.dumps(
                {
                    "houve_mudanca_relevante": True,
                    "mudancas": [{"tipo": "OBJETO_REMOVIDO"}],
                    "confianca_geral": 0.9,
                }
            )

    client = ClienteFalso()
    executor = OllamaSkillExecutor(client)
    definition = MarkdownDefinition(
        name="identify-change",
        description="Compara duas imagens.",
        instructions="Compare as imagens e retorne JSON.",
        file_path=Path("SKILL.md"),
        executor="ollama",
    )
    request = SkillExecutionRequest(
        skill_name="identify-change",
        image=b"imagem-atual",
        input_data={},
        session_id="sessao",
        correlation_id="sessao",
    )

    resultado = asyncio.run(
        executor.execute(request, definition, MudancaResultado)
    )

    assert resultado.houve_mudanca_relevante
    assert client.schema["additionalProperties"] is False
    assert "mudancas" in client.schema["required"]
    assert (
        client.schema["$defs"]["MudancaItem"]["properties"]["tipo"]["enum"]
        == [
            "OBJETO_NOVO",
            "OBJETO_REMOVIDO",
            "OBJETO_REPOSICIONADO",
            "ESTADO_ALTERADO",
            "POSSIVEL_BLOQUEIO",
            "ALTERACAO_LAYOUT",
        ]
    )
    assert (
        client.schema["$defs"]["ObjetoAlterado"]["properties"]["confianca"]["anyOf"][0][
            "maximum"
        ]
        == 1.0
    )


def test_executor_rejeita_saida_json_sem_confianca():
    class ClienteFalso:
        async def analyze_image(self, **kwargs):
            return json.dumps(
                {
                    "houve_mudanca_relevante": True,
                    "mudancas": [{"tipo": "OBJETO_REMOVIDO"}],
                }
            )

    executor = OllamaSkillExecutor(ClienteFalso())
    definition = MarkdownDefinition(
        name="identify-change",
        description="Compara duas imagens.",
        instructions="Compare as imagens e retorne JSON.",
        file_path=Path("SKILL.md"),
        executor="ollama",
    )
    request = SkillExecutionRequest(
        skill_name="identify-change",
        image=b"imagem-atual",
        input_data={},
        session_id="sessao",
        correlation_id="sessao",
    )

    with pytest.raises(OllamaSchemaValidationError):
        asyncio.run(executor.execute(request, definition, MudancaResultado))
