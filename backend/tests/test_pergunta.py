from src.farol.pergunta.fluxo_simples import classificar_intencao, normalizar, processar_caminho1
from src.farol.pergunta.roteador import rotear_pergunta


class Obj:
    def __init__(self, classe_yolo, horizontal, distancia, area_rel=0.2):
        self.classe_yolo = classe_yolo
        self.horizontal = horizontal
        self.distancia = distancia
        self.area_rel = area_rel


class SessaoStub:
    def __init__(self):
        self.descricao_inicial_feita = True


def test_classe_intencao_e_caminho1_basico():
    assert classificar_intencao(normalizar("de que cor é a camiseta")) == "ATRIBUTO"
    assert classificar_intencao(normalizar("onde está a mochila")) == "LOCALIZAR"
    assert classificar_intencao(normalizar("quantas cadeiras tem")) == "CONTAR"
    assert classificar_intencao(normalizar("tem cadeira")) == "EXISTE"
    assert classificar_intencao(normalizar("corredor")) == "GERAL"


def test_processar_caminho1_ignora_palavras_ambiguas():
    objs = [Obj("chair", "à esquerda", "perto")]
    resp = processar_caminho1("onde está a cadeira", objs)
    assert "cadeira" in resp.lower()
    assert "à esquerda" in resp.lower()


def test_roteador_classes_zero_false_positive():
    objs = [Obj("chair", "à esquerda", "perto")]
    dec = rotear_pergunta("onde está a mochila", objs, SessaoStub())
    assert dec.caminho == 1
    assert "mochila" in dec.resposta_direta.lower()


def test_roteador_pergunta_antes_da_descricao():
    objs = [Obj("chair", "à esquerda", "perto")]
    dec = rotear_pergunta("onde está a cadeira", objs, SessaoStub())
    assert dec.caminho in (1, 2)


def test_perguntas_de_escada_vao_para_caminho_deterministico():
    objs = [Obj("degrau", "à direita", "perto")]

    tem = rotear_pergunta("tem escada?", objs, SessaoStub())
    onde = rotear_pergunta("onde está a escada?", objs, SessaoStub())
    quantas = rotear_pergunta("quantas escadas?", objs, SessaoStub())

    assert tem.caminho == onde.caminho == quantas.caminho == 1
    assert "escada" in tem.resposta_direta.lower()
    assert "à direita" in onde.resposta_direta.lower()
    assert "uma escada" in quantas.resposta_direta.lower()


def test_contagem_de_degraus_e_tamanho_de_escada_usam_gemma():
    objetos = [Obj("degrau", "à direita", "perto")]

    quantidade = rotear_pergunta("quantos degraus tem?", objetos, SessaoStub())
    tamanho = rotear_pergunta("qual o tamanho da escada?", objetos, SessaoStub())

    assert quantidade.caminho == 2
    assert quantidade.classe_alvo_en == "degrau"
    assert tamanho.caminho == 2
