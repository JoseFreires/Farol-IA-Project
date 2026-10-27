from datetime import datetime

from rules.rules import (
    AnalysisData,
    VisualEvent,
    SessionMemory,
    Rules,
    RulesConfig,
)


def test_regra_fala_sobre_nova_mudanca_com_confianca_suficiente():
    regras = Rules(RulesConfig())
    dados = AnalysisData(
        session_id="sessao",
        eventos=(
            VisualEvent(
                tipo="mudanca",
                confianca=0.85,
                descricao="Uma cadeira apareceu no centro.",
            ),
        ),
    )
    memoria = SessionMemory(descricao_inicial_realizada=True)

    decisao = regras.avaliar(dados, memoria, None)

    assert decisao.deve_falar
    assert decisao.mensagem == "Uma cadeira apareceu no centro."
    assert decisao.motivo == "MUDANCA_DETECTADA"


def test_regra_nao_repete_evento_ja_memorizado():
    evento = VisualEvent(
        tipo="risco",
        objeto="cadeira",
        confianca=0.9,
        descricao="Possível cadeira no caminho.",
    )
    regras = Rules(RulesConfig(), clock=lambda: datetime(2026, 1, 1))
    dados = AnalysisData(
        session_id="sessao",
        eventos=(evento,),
    )
    memoria = SessionMemory(
        descricao_inicial_realizada=True,
        eventos_recentes=(evento,),
    )

    decisao = regras.avaliar(dados, memoria, None)

    assert not decisao.deve_falar


def test_pergunta_sobre_mudanca_nao_e_classificada_como_risco():
    regras = Rules(RulesConfig())
    dados = AnalysisData(
        session_id="sessao",
        eventos=(
            VisualEvent(
                tipo="mudanca",
                confianca=0.85,
                descricao="Uma cadeira apareceu no centro.",
            ),
        ),
    )

    decisao = regras.avaliar(dados, SessionMemory(), "O que mudou?")

    assert decisao.deve_falar
    assert decisao.prioridade == "INFORMATIVA"
    assert decisao.motivo == "MUDANCA_DETECTADA"


def test_evento_estruturado_precede_descricao_global():
    regras = Rules(RulesConfig())
    evento = VisualEvent(
        tipo="mudanca",
        objeto="copo",
        confianca=0.9,
        descricao="Um copo foi removido.",
        metadados={"tipo_mudanca": "OBJETO_REMOVIDO"},
    )
    dados = AnalysisData(
        session_id="sessao",
        descricao="A cozinha continua visível.",
        eventos=(evento,),
        confianca_geral=0.95,
    )

    decisao = regras.avaliar(
        dados,
        SessionMemory(descricao_inicial_realizada=True),
        None,
    )

    assert decisao.deve_falar
    assert decisao.motivo == "MUDANCA_DETECTADA"
    assert decisao.eventos_anunciados == (evento,)


def test_evento_novo_nao_e_descartado_pelo_cooldown_da_fala_anterior():
    agora = datetime(2026, 1, 1, 12, 0, 0)
    evento = VisualEvent(
        tipo="mudanca",
        objeto="copo",
        confianca=0.9,
        metadados={"tipo_mudanca": "OBJETO_REMOVIDO"},
    )
    regras = Rules(RulesConfig(), clock=lambda: agora)
    memoria = SessionMemory(
        descricao_inicial_realizada=True,
        ultima_fala_em=agora,
    )

    decisao = regras.avaliar(
        AnalysisData(session_id="sessao", eventos=(evento,)),
        memoria,
        None,
    )

    assert decisao.deve_falar
    assert decisao.mensagem == "O objeto copo não aparece mais na imagem atual."


def test_evento_abaixo_do_limiar_nao_e_anunciado():
    regras = Rules(RulesConfig())
    evento = VisualEvent(tipo="mudanca", confianca=0.69, descricao="Mudança.")

    decisao = regras.avaliar(
        AnalysisData(session_id="sessao", eventos=(evento,)),
        SessionMemory(descricao_inicial_realizada=True),
        None,
    )

    assert not decisao.deve_falar
    assert decisao.motivo == "SEM_EVENTO_RELEVANTE"
