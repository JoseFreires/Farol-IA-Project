from types import SimpleNamespace

from src.farol.contratos import Prioridade
from src.farol.main import _criar_percepcao
from src.farol.fila_saida import FilaSaida


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
