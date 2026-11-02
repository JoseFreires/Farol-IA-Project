import numpy as np

from src.farol.contratos import ObjetoTratado
from scripts.monitor_farol import _desenhar_deteccoes


def test_overlay_desenha_lista_de_objetos_e_fala_sem_alterar_resolucao():
    frame = np.zeros((360, 640, 3), dtype=np.uint8)
    objeto = ObjetoTratado(
        classe_yolo="degrau",
        classe_pt="escada",
        horizontal="à frente",
        distancia="perto",
        area_rel=0.2,
        origem="degraus",
        risco=True,
    )

    anotado = _desenhar_deteccoes(
        frame.copy(), [], [objeto], "Atenção! escada à frente, perto."
    )

    assert anotado.shape == frame.shape
    assert np.any(anotado != frame)
