from types import SimpleNamespace

from src.farol.contratos import Prioridade
from src.farol.main import _criar_percepcao, _expira_ms_informativa
from src.farol.fila_saida import FilaSaida


def test_ttl_informativo_por_motivo():
    cfg = {
        "mensagens": {
            "expira_ms_informativa": 4000,
            "expira_ms_objeto_novo": 10000,
            "expira_ms_descricao_inicial": 15000,
        }
    }

    assert _expira_ms_informativa(cfg) == 15000
    assert _expira_ms_informativa(
        cfg, SimpleNamespace(motivo="OBJETO_NOVO")
    ) == 10000
    assert _expira_ms_informativa(cfg, SimpleNamespace(motivo="MUDANCA_CENA")) == 4000


def test_falha_ao_carregar_degraus_avisa_e_mantem_detector_coco(monkeypatch):
    coco = object()
    monkeypatch.setattr("src.farol.main.DetectorCoco", lambda cfg: coco)

    def falhar(_):
        raise FileNotFoundError("pesos ausentes")

    monkeypatch.setattr("src.farol.main.DetectorDegraus", falhar)
    saida = FilaSaida()
    percepcao = _criar_percepcao(
        {"yolo_degraus": {"habilitado": True, "modelo": "nao-existe.pt"}},
        saida,
    )

    assert percepcao.coco is coco
    assert percepcao.degraus is None
    mensagem = saida.proxima()
    assert mensagem is not None
    assert mensagem.prioridade == Prioridade.CRITICA
    assert "degraus" in mensagem.mensagem.lower()
