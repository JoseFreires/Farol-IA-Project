from src.farol.contratos import Deteccao
from src.farol.contexto import texto_objetos
from src.farol.filtro import filtro_normal, montar_base


def _det(classe, origem, bbox, conf=0.9):
    return Deteccao(
        classe_yolo=classe,
        conf=conf,
        x1=bbox[0],
        y1=bbox[1],
        x2=bbox[2],
        y2=bbox[3],
        frame_id=1,
        origem=origem,
        frame_width=100,
        frame_height=100,
    )


def test_montar_base_prioriza_degrau_sem_corta_lo_por_max_objetos():
    bruto = [
        _det("chair", "coco", (0, 0, 50, 50)),
        _det("degrau", "degraus", (10, 10, 90, 90)),
    ]

    base = montar_base(
        bruto,
        {"conf_min": 0.5, "area_min": 0.01, "max_objetos": 0, "largura": 100, "altura": 100},
        {"classes": ["degrau"], "nomes_pt": {"degrau": "escada"}},
    )

    assert len(base) == 1
    assert base[0].classe_yolo == "degrau"
    assert base[0].classe_pt == "escada"
    assert base[0].origem == "degraus"
    assert base[0].risco is True
    assert base[0].bbox == (10.0, 10.0, 90.0, 90.0)


def test_filtro_normal_ignora_deteccoes_do_modelo_degraus():
    degrau = _det("degrau", "degraus", (10, 10, 90, 90))

    assert filtro_normal(
        [degrau],
        {"conf_min": 0.1, "area_min": 0.0, "largura": 100, "altura": 100},
    ) == ()


def test_montar_base_aplica_area_minima_ao_degrau():
    degrau_pequeno = _det("degrau", "degraus", (10, 10, 15, 15))

    base = montar_base(
        [degrau_pequeno],
        {"area_min": 0.01, "largura": 100, "altura": 100},
        {"classes": ["degrau"]},
    )

    assert base == ()


def test_contexto_identifica_escada_e_se_indicacao_ja_foi_dada():
    escada = montar_base(
        [_det("degrau", "degraus", (10, 10, 90, 90))],
        {"area_min": 0.01, "largura": 100, "altura": 100},
        {"classes": ["degrau"], "nomes_pt": {"degrau": "escada"}},
    )

    assert "[risco]" in texto_objetos(escada)
    assert "[risco, já avisado]" in texto_objetos(escada, {"degrau:à frente"})
