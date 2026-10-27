import asyncio
import io
import logging
from pathlib import Path

from PIL import Image, ImageDraw
import pytest

from app.processor import Processor, ProcessingRequest, SessionManager
from agent_runtime import AgentRuntime, MarkdownLoader, SkillRegistry
from agent_runtime.runtime import (
    LocalizarObjetoResultado,
    MudancaItem,
    MudancaResultado,
)
from rules.rules import AnalysisData, SessionMemory, VisualEvent


def _imagem(cor: tuple[int, int, int]) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 64), cor).save(buffer, format="PNG")
    return buffer.getvalue()


def _imagem_com_mudanca_local() -> bytes:
    imagem = Image.new("RGB", (64, 64), "white")
    ImageDraw.Draw(imagem).rectangle((0, 0, 15, 63), fill="black")
    buffer = io.BytesIO()
    imagem.save(buffer, format="PNG")
    return buffer.getvalue()


class AgenteFalso:
    def __init__(self) -> None:
        self.chamadas = 0
        self.imagens_anteriores: list[bytes | None] = []
        self.skills_forcadas: list[str | None] = []
        self.perguntas: list[str | None] = []
        self.memoria_inicial: list[bool] = []

    async def processar(self, solicitacao, memoria):
        self.chamadas += 1
        self.imagens_anteriores.append(solicitacao.imagem_anterior)
        self.skills_forcadas.append(solicitacao.skill_override)
        self.perguntas.append(solicitacao.pergunta)
        self.memoria_inicial.append(memoria.descricao_inicial_realizada)
        resposta = "A mesa está à direita." if solicitacao.pergunta else None
        return AnalysisData(
            session_id=solicitacao.session_id,
            descricao="Ambiente de teste." if not solicitacao.pergunta else None,
            resposta_semantica=resposta,
            confianca_geral=0.9,
        )


def test_processor_descarta_frame_igual_mas_processa_pergunta():
    agente = AgenteFalso()
    processor = Processor(runtime=agente)
    imagem = _imagem((255, 255, 255))

    async def processar():
        primeira = await processor.processar(
            ProcessingRequest("sessao-stream", imagem)
        )
        repetida = await processor.processar(
            ProcessingRequest("sessao-stream", imagem)
        )
        pergunta = await processor.processar(
            ProcessingRequest("sessao-stream", imagem, "Onde está a mesa?")
        )
        return primeira, repetida, pergunta

    primeira, repetida, pergunta = asyncio.run(processar())

    assert primeira.deve_falar
    assert repetida.motivo == "SEM_MUDANCA_VISUAL"
    assert not repetida.deve_falar
    assert pergunta.deve_falar
    assert pergunta.mensagem == "A mesa está à direita."
    assert agente.chamadas == 2
    assert agente.imagens_anteriores[0] is None
    assert agente.imagens_anteriores[1]


def test_frame_alterado_encaminha_imagem_anterior_ao_runtime():
    agente = AgenteFalso()
    processor = Processor(runtime=agente)

    async def processar():
        await processor.processar(
            ProcessingRequest("sessao-imagem-anterior", _imagem((255, 255, 255)))
        )
        await processor.processar(
            ProcessingRequest("sessao-imagem-anterior", _imagem_com_mudanca_local())
        )

    asyncio.run(processar())

    assert agente.chamadas == 2
    assert agente.imagens_anteriores[0] is None
    assert agente.imagens_anteriores[1]


def test_mudanca_local_forca_skill_de_identificacao_de_mudanca():
    agente = AgenteFalso()
    processor = Processor(runtime=agente)

    async def processar():
        await processor.processar(
            ProcessingRequest("sessao-mudanca-local", _imagem((255, 255, 255)))
        )
        resultado = await processor.processar(
            ProcessingRequest("sessao-mudanca-local", _imagem_com_mudanca_local())
        )
        return resultado

    asyncio.run(processar())

    assert agente.chamadas == 2
    assert agente.skills_forcadas[1] == "identify-change"
    assert agente.imagens_anteriores[1]


def test_limiar_local_inclusivo_direciona_para_identificacao(monkeypatch):
    agente = AgenteFalso()
    processor = Processor(runtime=agente)
    monkeypatch.setattr(
        "app.processor.calcular_diferenca_visual",
        lambda imagem, anterior: 0.08,
    )

    async def processar():
        await processor.processar(
            ProcessingRequest("sessao-limiar-local", _imagem((255, 255, 255)))
        )
        return await processor.processar(
            ProcessingRequest("sessao-limiar-local", _imagem((180, 180, 180)))
        )

    asyncio.run(processar())

    assert agente.chamadas == 2
    assert agente.skills_forcadas[1] == "identify-change"


def test_mudanca_drastica_reseta_memoria_e_forca_nova_descricao():
    agente = AgenteFalso()
    session_manager = SessionManager()
    processor = Processor(session_manager=session_manager, runtime=agente)

    async def processar():
        await processor.processar(
            ProcessingRequest("sessao-novo-comodo", _imagem((255, 255, 255)))
        )
        return await processor.processar(
            ProcessingRequest(
                "sessao-novo-comodo",
                _imagem((134, 134, 134)),
                pergunta="Onde está a mesa?",
            )
        )

    resultado = asyncio.run(processar())
    memoria = session_manager.obter_memoria("sessao-novo-comodo")

    assert agente.chamadas == 2
    assert agente.skills_forcadas[1] == "describe-environment"
    assert agente.perguntas[1] is None
    assert not agente.memoria_inicial[1]
    assert agente.imagens_anteriores[1] is None
    assert resultado.motivo == "DESCRICAO_INICIAL"
    assert memoria.descricao_inicial_realizada


def test_limiar_ambiental_inclusivo_reseta_contexto(monkeypatch):
    agente = AgenteFalso()
    session_manager = SessionManager()
    processor = Processor(session_manager=session_manager, runtime=agente)
    monkeypatch.setattr(
        "app.processor.calcular_diferenca_visual",
        lambda imagem, anterior: 0.45,
    )

    async def processar():
        await processor.processar(
            ProcessingRequest("sessao-limiar-ambiente", _imagem((255, 255, 255)))
        )
        await processor.processar(
            ProcessingRequest("sessao-limiar-ambiente", _imagem((134, 134, 134)))
        )

    asyncio.run(processar())

    assert agente.skills_forcadas[1] == "describe-environment"
    assert not agente.memoria_inicial[1]


def test_frame_estatico_nao_chama_runtime():
    agente = AgenteFalso()
    processor = Processor(runtime=agente)

    async def processar():
        await processor.processar(
            ProcessingRequest("sessao-frame-estatico", _imagem((255, 255, 255)))
        )
        return await processor.processar(
            ProcessingRequest("sessao-frame-estatico", _imagem((255, 255, 255)))
        )

    resultado = asyncio.run(processar())

    assert agente.chamadas == 1
    assert resultado.motivo == "SEM_MUDANCA_VISUAL"


def test_processador_anuncia_remocao_nova_mesmo_apos_fala_recente():
    evento = VisualEvent(
        tipo="mudanca",
        objeto="copo",
        confianca=0.9,
        descricao="Um dos dois copos não aparece mais.",
        metadados={"tipo_mudanca": "OBJETO_REMOVIDO"},
    )

    class RuntimeComDescricaoEMudanca:
        def __init__(self):
            self.chamadas = 0

        async def processar(self, solicitacao, memoria):
            self.chamadas += 1
            if self.chamadas == 1:
                return AnalysisData(
                    session_id=solicitacao.session_id,
                    descricao="Dois copos estão sobre a mesa.",
                    confianca_geral=0.95,
                )
            return AnalysisData(
                session_id=solicitacao.session_id,
                eventos=(evento,),
                confianca_geral=0.9,
            )

    runtime = RuntimeComDescricaoEMudanca()
    processor = Processor(runtime=runtime)

    async def processar():
        inicial = await processor.processar(
            ProcessingRequest("sessao-copos", _imagem((255, 255, 255)))
        )
        alteracao = await processor.processar(
            ProcessingRequest("sessao-copos", _imagem_com_mudanca_local())
        )
        return inicial, alteracao

    inicial, alteracao = asyncio.run(processar())

    assert inicial.motivo == "DESCRICAO_INICIAL"
    assert alteracao.deve_falar
    assert alteracao.motivo == "MUDANCA_DETECTADA"
    assert alteracao.mensagem == "O objeto copo não aparece mais na imagem atual."
    assert runtime.chamadas == 2


def test_selecao_de_skill_e_deterministica():
    selecionar = AgentRuntime._selecionar_skill

    assert selecionar(None, False) == "describe-environment"
    assert selecionar(None, True) == "identify-change"
    assert selecionar("Existe algum risco?", True) == "detect-risk"
    assert selecionar("Onde está a mesa?", True) == "locate-object"


def test_registry_descobre_skills_genericas():
    skills_root = Path(__file__).resolve().parents[1] / "skills"
    loader = MarkdownLoader(allowed_roots=(skills_root,))
    registry = SkillRegistry(skills_root, loader)

    registry.discover()

    assert {skill.name for skill in registry.list_summaries()} == {
        "describe-environment",
        "detect-risk",
        "identify-change",
        "locate-object",
    }


def test_runtime_encaminha_imagem_anterior_para_skill_de_mudanca():
    from agent_runtime.models import SkillExecutionResult
    from rules.rules import SessionMemory

    class SkillExecutorFalso:
        def __init__(self):
            self.request = None

        async def execute(self, *, agent_name, request, output_model):
            self.request = request
            return SkillExecutionResult(
                skill_name=request.skill_name,
                data=output_model(
                    houve_mudanca_relevante=False,
                    mudancas=[],
                ),
                success=True,
                duration_ms=0,
            )

    executor = SkillExecutorFalso()
    runtime = AgentRuntime(executor)
    request = ProcessingRequest(
        "sessao-mudanca",
        _imagem((0, 0, 0)),
        imagem_anterior=b"imagem-anterior",
    )

    asyncio.run(runtime.processar(request, SessionMemory(descricao_inicial_realizada=True)))

    assert executor.request.skill_name == "identify-change"
    assert executor.request.previous_image == b"imagem-anterior"


def test_runtime_mapeia_remocao_e_herda_confianca_do_objeto():
    from agent_runtime.models import SkillExecutionResult

    class SkillExecutorFalso:
        async def execute(self, *, agent_name, request, output_model):
            return SkillExecutionResult(
                skill_name=request.skill_name,
                data=output_model.model_validate(
                    {
                        "houve_mudanca_relevante": True,
                        "mudancas": [
                            {
                                "tipo": "OBJETO_REMOVIDO",
                                "objetos_alterados": [
                                    {"nome": "copo", "confianca": 0.88}
                                ],
                            }
                        ],
                        "confianca_geral": 0.91,
                    }
                ),
                success=True,
                duration_ms=0,
            )

    runtime = AgentRuntime(SkillExecutorFalso())
    request = ProcessingRequest(
        "sessao-remocao",
        _imagem((0, 0, 0)),
        imagem_anterior=b"imagem-anterior",
    )

    dados = asyncio.run(
        runtime.processar(request, SessionMemory(descricao_inicial_realizada=True))
    )

    assert len(dados.eventos) == 1
    evento = dados.eventos[0]
    assert evento.tipo == "mudanca"
    assert evento.objeto == "copo"
    assert evento.confianca == 0.88
    assert evento.metadados["tipo_mudanca"] == "OBJETO_REMOVIDO"


def test_schema_de_mudancas_rejeita_confiança_invalida_e_saida_inconsistente():
    with pytest.raises(ValueError):
        MudancaResultado.model_validate(
            {
                "houve_mudanca_relevante": True,
                "mudancas": [],
                "confianca_geral": 0.9,
            }
        )

    with pytest.raises(ValueError):
        MudancaResultado.model_validate(
            {
                "houve_mudanca_relevante": True,
                "mudancas": [{"tipo": "OBJETO_REMOVIDO", "campo_desconhecido": True}],
                "confianca_geral": 0.9,
            }
        )

    with pytest.raises(ValueError):
        MudancaResultado.model_validate(
            {
                "houve_mudanca_relevante": True,
                "mudancas": [{"tipo": "OBJETO_REMOVIDO"}],
            }
        )

    with pytest.raises(ValueError):
        MudancaResultado.model_validate(
            {
                "houve_mudanca_relevante": True,
                "mudancas": [
                    {"tipo": "OBJETO_REMOVIDO", "confianca": 1.2}
                ],
                "confianca_geral": 0.9,
            }
        )


def test_runtime_usa_confianca_geral_quando_item_nao_informa_confianca():
    item = MudancaItem(
        tipo="OBJETO_REMOVIDO",
        descricao="Um copo foi removido.",
    )

    evento = AgentRuntime._evento_mudanca(item, 0.91)

    assert evento.confianca == 0.91


def test_schema_de_descricao_exige_resposta_sem_fallback():
    with pytest.raises(ValueError):
        LocalizarObjetoResultado.model_validate(
            {"objeto_encontrado": True}
        )


def test_processor_regista_analysisdata_com_eventos(caplog):
    agente = AgenteFalso()
    processor = Processor(runtime=agente)
    caplog.set_level(logging.INFO, logger="app.processor")
    evento = VisualEvent(
        tipo="mudanca",
        objeto="copo",
        confianca=0.9,
        descricao="Um copo foi removido.",
    )

    class RuntimeComEvento:
        async def processar(self, solicitacao, memoria):
            return AnalysisData(
                session_id=solicitacao.session_id,
                eventos=(evento,),
                confianca_geral=0.9,
            )

    processor.runtime = RuntimeComEvento()

    asyncio.run(
        processor.processar(
            ProcessingRequest("sessao-log", _imagem((255, 255, 255)))
        )
    )

    assert "eventos=(" in caplog.text
    assert "copo" in caplog.text
    assert "confianca_geral=0.9" in caplog.text
