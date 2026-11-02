from src.farol.contratos import Deteccao
from src.farol.risco.identificar_risco import identificar_risco
from src.farol.risco.trigger import deve_alertar, registrar_alerta
from src.farol.sessao import EstadoRisco


def _degrau(area):
    largura = 100
    altura = 100
    lado = (area * largura * altura) ** 0.5
    return Deteccao(
        "degrau",
        0.9,
        50 - lado / 2,
        50 - lado / 2,
        50 + lado / 2,
        50 + lado / 2,
        frame_id=3,
        origem="degraus",
        frame_width=largura,
        frame_height=altura,
    )


def test_risco_degrau_respeita_limiares_e_nome_de_fala():
    cfg = {
        "conf_min": 0.3,
        "classes_criticas": ["degrau"],
        "area_aviso": 0.1,
        "area_atencao": 0.25,
        "nomes_pt": {"degrau": "escada"},
    }

    assert identificar_risco([_degrau(0.08)], cfg) == []
    aviso = identificar_risco([_degrau(0.16)], cfg)[0]
    atencao = identificar_risco([_degrau(0.36)], cfg)[0]

    assert aviso.nivel == "AVISO"
    assert aviso.mensagem.startswith("Aviso: escada")
    assert aviso.chave == "degrau:à frente"
    assert atencao.nivel == "ATENCAO"
    assert atencao.mensagem.startswith("Atenção! escada")


def test_classes_criticas_vazia_desativa_ramo_de_alerta_de_degrau():
    assert identificar_risco(
        [_degrau(0.36)],
        {"classes": [], "classes_criticas": [], "conf_min": 0.3},
    ) == []


def test_trigger_nao_repete_sem_aproximacao_ou_timeout():
    estado = EstadoRisco()
    risco = identificar_risco(
        [_degrau(0.16)],
        {"classes_criticas": ["degrau"], "area_aviso": 0.1, "area_atencao": 0.25},
    )[0]
    registrar_alerta(estado, risco.chave, risco.area_rel, 10)

    assert not deve_alertar(risco.chave, risco.area_rel, 11, estado, 1.3, 10)
    assert deve_alertar(risco.chave, risco.area_rel * 1.31, 11, estado, 1.3, 10)
    assert deve_alertar(risco.chave, risco.area_rel, 21, estado, 1.3, 10)
