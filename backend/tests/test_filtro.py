from src.farol.contratos import Deteccao
from src.farol.filtro import CLASSES_PT, distancia, filtro_normal, horizontal


def test_horizontal_distancia_e_filtro():
    deteccoes = (
        Deteccao(
            classe_yolo="chair",
            conf=0.95,
            x1=10,
            y1=20,
            x2=110,
            y2=140,
            id_track=1,
            frame_id=7,
        ),
        Deteccao(
            classe_yolo="person",
            conf=0.80,
            x1=900,
            y1=180,
            x2=980,
            y2=360,
            id_track=2,
            frame_id=7,
        ),
    )

    tratados = filtro_normal(deteccoes, {"conf_min": 0.50, "area_min": 0.01, "max_objetos": 8, "largura": 1000, "altura": 500})
    assert len(tratados) == 2
    cadeira = next(obj for obj in tratados if obj.classe_pt == "cadeira")
    assert cadeira.horizontal == "à esquerda"
    assert cadeira.distancia == "perto"
    assert horizontal(50, 100) == "à frente"
    assert distancia(0.12) == "perto"
    assert CLASSES_PT["chair"] == "cadeira"
