from src.farol.contratos import ObjetoTratado
from src.farol.mudanca.estabilizador import Estabilizador


def _objeto(classe="chair", track=1, origem="coco", horizontal="à frente", distancia="perto"):
    return ObjetoTratado(
        classe_yolo=classe,
        classe_pt="escada" if classe == "degrau" else classe,
        horizontal=horizontal,
        distancia=distancia,
        area_rel=0.2,
        id_track=track,
        origem=origem,
        risco=origem == "degraus",
    )


def test_estabilizador_confirma_entrada_e_histerese_de_rotulo():
    estabilizador = Estabilizador()
    cfg = {"frames_para_entrar": 2, "frames_para_sair": 2}
    cadeira = _objeto()

    assert estabilizador.atualizar([cadeira], cfg) == ()
    assert estabilizador.atualizar([cadeira], cfg) == (cadeira,)
    novo_rotulo = _objeto(horizontal="à esquerda", distancia="a média distância")
    assert estabilizador.atualizar([novo_rotulo], cfg)[0].horizontal == "à frente"
    confirmado = estabilizador.atualizar([novo_rotulo], cfg)[0]
    assert confirmado.horizontal == "à esquerda"
    assert confirmado.distancia == "a média distância"


def test_estabilizador_chave_sintetica_degrau_e_saida_histerese():
    estabilizador = Estabilizador()
    cfg = {"frames_para_entrar": 2, "frames_para_sair": 2}
    escada = _objeto("degrau", None, "degraus")

    assert estabilizador.atualizar([escada], cfg) == ()
    assert estabilizador.atualizar([escada], cfg) == (escada,)
    assert estabilizador.atualizar([], cfg) == (escada,)
    assert estabilizador.atualizar([], cfg) == ()


def test_estabilizador_ignora_coco_sem_track():
    estabilizador = Estabilizador()

    assert estabilizador.atualizar([_objeto(track=None)], {"frames_para_entrar": 1}) == ()


def test_estabilizador_confirma_entrada_por_tempo_e_minimo_de_quadros():
    estabilizador = Estabilizador()
    cadeira = _objeto()
    cfg = {
        "min_quadros_para_entrar": 2,
        "tempo_para_entrar_s": 0.6,
        "tempo_para_sair_s": 1.5,
    }

    assert estabilizador.atualizar([cadeira], cfg, agora=10.0) == ()
    assert estabilizador.atualizar([cadeira], cfg, agora=10.2) == ()
    assert estabilizador.atualizar([cadeira], cfg, agora=10.61) == (cadeira,)


def test_estabilizador_confirma_saida_por_tempo_sem_depender_de_fps():
    estabilizador = Estabilizador()
    cadeira = _objeto()
    cfg = {
        "min_quadros_para_entrar": 1,
        "tempo_para_entrar_s": 0,
        "tempo_para_sair_s": 1.5,
    }

    assert estabilizador.atualizar([cadeira], cfg, agora=10.0) == (cadeira,)
    assert estabilizador.atualizar([], cfg, agora=11.0) == (cadeira,)
    assert estabilizador.atualizar([], cfg, agora=11.49) == (cadeira,)
    assert estabilizador.atualizar([], cfg, agora=11.5) == ()
