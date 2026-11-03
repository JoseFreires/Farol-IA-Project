import threading
import time

from src.farol.contratos import MensagemSaida, Motivo, Origem, Prioridade
from src.farol.fila_saida import FilaSaida


def make_msg(msg: str, prioridade: Prioridade, expira_ms: int = 2000) -> MensagemSaida:
    return MensagemSaida(
        sessionId="s1",
        frameId=1,
        timestamp=time.time(),
        expiraEmMs=expira_ms,
        prioridade=prioridade,
        motivo=Motivo.AMBIENTE,
        origem=Origem.VLM,
        mensagem=msg,
        deveFalar=True,
        interrompe=False,
    )


def test_fila_saida_ttl_prioridade_e_interrompe():
    fila = FilaSaida()
    inf = make_msg("informativa", Prioridade.INFORMATIVA, expira_ms=50)
    resp = make_msg("resposta", Prioridade.RESPOSTA, expira_ms=5000)
    crit = make_msg("critica", Prioridade.CRITICA, expira_ms=5000)

    fila.publicar(inf)
    fila.publicar(resp)
    assert fila.proxima() == resp
    time.sleep(0.08)
    assert fila.proxima() is None

    fila.publicar(crit)
    fila.publicar(inf)
    fila.publicar(inf)
    assert fila.proxima().prioridade == Prioridade.CRITICA
    assert fila.proxima() is None
    assert fila.vazia() is True


def test_fila_saida_interrompe_limpa_informativas():
    fila = FilaSaida()
    fila.publicar(make_msg("a", Prioridade.INFORMATIVA, expira_ms=5000))
    fila.publicar(make_msg("b", Prioridade.INFORMATIVA, expira_ms=5000))
    crit = make_msg("c", Prioridade.CRITICA, expira_ms=5000)
    fila.publicar(crit, interrompe=True)
    assert fila.proxima().prioridade == Prioridade.CRITICA


def test_fila_saida_espera_mensagem_de_frame_com_tarefa_llm_pendente():
    fila = FilaSaida()
    fila.registrar_frame(1)
    finalizar_tarefa = fila.iniciar_tarefa_frame(1)
    fila.finalizar_frame(1)

    def concluir_llm():
        fila.publicar(make_msg("descrição", Prioridade.INFORMATIVA))
        finalizar_tarefa()

    threading.Timer(0.02, concluir_llm).start()

    mensagens = fila.aguardar_frame(1, timeout=1)

    assert mensagens is not None
    assert [mensagem.mensagem for mensagem in mensagens] == ["descrição"]
