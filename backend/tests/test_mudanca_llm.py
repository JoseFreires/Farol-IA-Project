from src.farol.contratos import Origem
from src.farol.contexto import texto_eventos_python
from src.farol.mensagens import msg_ambiente
from src.farol.mudanca.identificar_mudanca import identificar_mudanca
from src.farol.mudanca.identificar_mudanca import EventoMudanca


class ObjetoFake:
    def __init__(self, classe_yolo, classe_pt, horizontal, distancia, id_track=None):
        self.classe_yolo = classe_yolo
        self.classe_pt = classe_pt
        self.horizontal = horizontal
        self.distancia = distancia
        self.id_track = id_track


class EstadoFake:
    def __init__(
        self,
        ultimo_json=(),
        ultimo_ts_fala=None,
        descricao_inicial_feita=True,
        contexto_invalido=False,
        estado_mudanca=None,
    ):
        self.ultimo_json = ultimo_json
        self.ultimo_ts_fala = ultimo_ts_fala
        self.descricao_inicial_feita = descricao_inicial_feita
        self.contexto_invalido = contexto_invalido
        self.estado_mudanca = estado_mudanca


def test_identificar_mudanca_nao_dispara_llm_para_eventos_normais():
    cadeira = ObjetoFake("chair", "cadeira", "à frente", "perto")
    estado = EstadoFake(
        ultimo_json=(cadeira,)
    )
    baseline = identificar_mudanca((cadeira,), estado, {}, 122)
    estado.estado_mudanca = baseline.estado_mudanca
    atuais = (
        cadeira,
        ObjetoFake("person", "pessoa", "à esquerda", "perto"),
    )

    decisao = identificar_mudanca(atuais, estado, {"pesos_classe": {"chair": 0.4, "person": 1.0}, "pesos_distancia": {"perto": 0.8}, "fracao_drastica": 0.70, "limiar_score": 0.6, "cooldown_informativo_s": 0}, 123)

    assert decisao.deve_falar is True
    assert decisao.drastica is False
    assert decisao.deve_chamar_llm is False
    assert any(e.tipo == "ENTROU" for e in decisao.eventos)


def test_decisao_drastica_dispara_llm():
    objetos = (
        ObjetoFake("chair", "cadeira", "à frente", "perto"),
        ObjetoFake("table", "mesa", "à frente", "perto"),
        ObjetoFake("book", "livro", "à esquerda", "perto"),
    )
    estado = EstadoFake(
        ultimo_json=objetos
    )
    baseline = identificar_mudanca(objetos, estado, {}, 122)
    estado.estado_mudanca = baseline.estado_mudanca

    decisao = identificar_mudanca((), estado, {"pesos_classe": {}, "pesos_distancia": {}, "fracao_drastica": 0.70}, 123)

    assert decisao.deve_falar is True
    assert decisao.drastica is True
    assert decisao.deve_chamar_llm is True


def test_identidade_track_ignora_oscilacao_de_distancia():
    objeto = ObjetoFake("person", "pessoa", "à frente", "perto", id_track=7)
    estado = EstadoFake(ultimo_json=(objeto,))
    primeira = identificar_mudanca(
        (objeto,), estado, {"frames_para_entrar": 1}, 100
    )
    estado.estado_mudanca = primeira.estado_mudanca

    movido = ObjetoFake("person", "pessoa", "à frente", "a média distância", id_track=7)
    decisao = identificar_mudanca((movido,), estado, {"frames_para_entrar": 1}, 101)

    assert decisao.deve_falar is False
    assert decisao.eventos == []


def test_entrada_exige_persistencia_e_cooldown_diferido():
    objeto_inicial = ObjetoFake("chair", "cadeira", "à frente", "perto", id_track=1)
    estado = EstadoFake(ultimo_json=(objeto_inicial,))
    inicial = identificar_mudanca((objeto_inicial,), estado, {}, 100)
    estado.estado_mudanca = inicial.estado_mudanca

    novo = ObjetoFake("person", "pessoa", "à esquerda", "perto", id_track=2)
    cfg = {
        "frames_para_entrar": 3,
        "frames_para_sair": 5,
        "cooldown_informativo_s": 4,
        "limiar_score": 0.6,
        "pesos_classe": {"person": 1.0},
        "pesos_distancia": {"perto": 1.0},
    }
    estado.ultimo_ts_fala = 100
    for agora in (101, 102):
        decisao = identificar_mudanca((objeto_inicial, novo), estado, cfg, agora)
        assert decisao.deve_falar is False
        estado.estado_mudanca = decisao.estado_mudanca

    decisao = identificar_mudanca((objeto_inicial, novo), estado, cfg, 103)
    assert decisao.deve_falar is False
    estado.estado_mudanca = decisao.estado_mudanca

    estado.ultimo_ts_fala = 100
    decisao = identificar_mudanca((objeto_inicial, novo), estado, cfg, 105)
    assert decisao.deve_falar is True
    assert decisao.eventos[0].tipo == "ENTROU"


def test_evento_de_baixa_relevancia_e_falado_apos_tempo_maximo():
    inicial = ObjetoFake("person", "pessoa", "à frente", "perto", id_track=1)
    estado = EstadoFake(ultimo_json=(inicial,))
    baseline = identificar_mudanca((inicial,), estado, {}, 100)
    estado.estado_mudanca = baseline.estado_mudanca
    cadeira = ObjetoFake("chair", "cadeira", "à frente", "perto", id_track=2)
    cfg = {
        "cooldown_informativo_s": 0,
        "limiar_score": 0.6,
        "max_espera_evento_s": 2.5,
        "pesos_classe": {"chair": 0.4},
        "pesos_distancia": {"perto": 0.8},
    }

    pendente = identificar_mudanca((inicial, cadeira), estado, cfg, 101)
    assert pendente.deve_falar is False
    estado.estado_mudanca = pendente.estado_mudanca

    antes_do_prazo = identificar_mudanca((inicial, cadeira), estado, cfg, 103.49)
    assert antes_do_prazo.deve_falar is False
    estado.estado_mudanca = antes_do_prazo.estado_mudanca

    no_prazo = identificar_mudanca((inicial, cadeira), estado, cfg, 103.5)
    assert no_prazo.deve_falar is True
    assert no_prazo.motivo == "OBJETO_NOVO"


def test_contexto_invalido_gera_evento_drastico():
    estado = EstadoFake(contexto_invalido=True)
    decisao = identificar_mudanca((), estado, {"cooldown_informativo_s": 0}, 100)

    assert decisao.deve_falar is True
    assert decisao.deve_chamar_llm is True
    assert decisao.eventos[0].tipo == "MUDANCA_DRASTICA"


def test_mudanca_drastica_respeita_cooldown():
    objetos = tuple(
        ObjetoFake(classe, classe, "à frente", "perto", id_track=indice)
        for indice, classe in enumerate(("chair", "table", "book"))
    )
    estado = EstadoFake(ultimo_json=objetos, ultimo_ts_fala=100)
    baseline = identificar_mudanca(objetos, estado, {}, 100)
    estado.estado_mudanca = baseline.estado_mudanca
    config = {
        "frames_para_sair": 1,
        "fracao_drastica": 0.70,
        "cooldown_informativo_s": 4,
    }

    aguardando = identificar_mudanca((), estado, config, 102)
    assert aguardando.deve_falar is False
    estado.estado_mudanca = aguardando.estado_mudanca

    pronta = identificar_mudanca((), estado, config, 105)
    assert pronta.deve_falar is True
    assert pronta.deve_chamar_llm is True


def test_mensagem_python_marca_origem_yolo():
    mensagem = msg_ambiente(
        "Uma pessoa entrou à frente.",
        None,
        10,
        origem=Origem.SOMENTE_YOLO,
    )

    assert mensagem.origem is Origem.SOMENTE_YOLO


def test_objeto_inanimado_so_e_anunciado_na_primeira_entrada():
    anunciadas = set()
    entrou = EventoMudanca(
        "ENTROU", "forno", "à esquerda", "perto", classe_yolo="oven"
    )
    saiu = EventoMudanca(
        "SAIU", "forno", "à esquerda", "perto", classe_yolo="oven"
    )

    assert texto_eventos_python([entrou], anunciadas) == (
        "Forno foi identificado no ambiente à esquerda."
    )
    assert texto_eventos_python([saiu], anunciadas) == ""
    assert texto_eventos_python([entrou], anunciadas) == ""


def test_eventos_de_pessoas_e_animais_mantem_entrada_e_saida():
    anunciadas = set()
    entrou = EventoMudanca(
        "ENTROU", "cachorro", "à direita", "perto", classe_yolo="dog"
    )
    saiu = EventoMudanca(
        "SAIU", "cachorro", "à direita", "perto", classe_yolo="dog"
    )

    assert texto_eventos_python([entrou, saiu], anunciadas) == (
        "cachorro entrou à direita, perto. cachorro saiu à direita, perto."
    )


def test_objetos_da_descricao_inicial_sao_considerados_ja_anunciados():
    forno = ObjetoFake("oven", "forno", "à esquerda", "perto")
    estado = EstadoFake(ultimo_json=(forno,))

    decisao = identificar_mudanca((forno,), estado, {}, 100)

    assert decisao.estado_mudanca.classes_inanimadas_anunciadas == {"oven"}


def test_objetos_de_risco_nao_geram_evento_de_mudanca():
    escada = ObjetoFake("degrau", "escada", "à direita", "perto")
    escada.risco = True
    escada.origem = "degraus"
    estado = EstadoFake()

    baseline = identificar_mudanca((), estado, {}, 100)
    estado.estado_mudanca = baseline.estado_mudanca
    decisao = identificar_mudanca((escada,), estado, {"frames_para_entrar": 1}, 101)

    assert decisao.deve_falar is False
    assert decisao.eventos == []
