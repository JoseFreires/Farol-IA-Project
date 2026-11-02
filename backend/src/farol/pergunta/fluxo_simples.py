import re
import unicodedata


def normalizar(txt: str) -> str:
    txt = unicodedata.normalize("NFD", txt.lower())
    return "".join(c for c in txt if unicodedata.category(c) != "Mn").strip()


def tem_palavra(texto_norm: str, termos: list[str]) -> bool:
    for termo in termos:
        termo_norm = unicodedata.normalize("NFD", termo.lower())
        termo_norm = "".join(c for c in termo_norm if unicodedata.category(c) != "Mn")
        if termo_norm == "quant":
            padrao = r"\bquant\w*\b"
        else:
            padrao = r"\b" + re.escape(termo_norm) + r"\b"
        if re.search(padrao, texto_norm):
            return True
    return False


def processar_caminho1(pergunta: str, objetos_tratados: list, intencao=None, termo_pt=None, classe_en=None):
    pergunta_norm = normalizar(pergunta)
    from src.farol.pergunta.vocabulario import ARTIGO, TERMO_EXIBICAO, achar_termo, pluralizar

    if intencao is None:
        intencao = classificar_intencao(pergunta_norm)
    if termo_pt is None or classe_en is None:
        termo_pt, classe_en = achar_termo(pergunta_norm)

    if not classe_en:
        return None

    termo = TERMO_EXIBICAO.get(termo_pt, termo_pt)
    artigo = ARTIGO.get(termo_pt, ARTIGO.get(classe_en, ARTIGO["default"]))
    matches = [o for o in objetos_tratados if o.classe_yolo == classe_en]

    if intencao == "CONTAR":
        qtd = len(matches)
        if qtd == 0:
            return f"Não detectei {termo} agora. Tente girar a câmera."
        if qtd == 1:
            indefinido = "uma" if artigo == "a" else "um"
            return f"Há {indefinido} {termo}."
        return f"Há {qtd} {pluralizar(termo)}."

    if intencao == "EXISTE":
        if matches:
            o = matches[0]
            indefinido = "uma" if artigo == "a" else "um"
            return f"Sim, há {indefinido} {termo} {o.horizontal}, {o.distancia}."
        return f"Não detectei {termo} agora. Tente girar a câmera."

    if intencao == "LOCALIZAR":
        if matches:
            if len(matches) > 1:
                o = max(matches, key=lambda x: x.area_rel)
                return f"Há {len(matches)} {pluralizar(termo)}; a mais próxima está {o.horizontal}, {o.distancia}."
            o = matches[0]
            return f"{artigo.capitalize()} {termo} está {o.horizontal}, {o.distancia}."
        return f"Não detectei {termo} agora. Tente girar a câmera."

    if intencao == "ATRIBUTO":
        return None

    return None


def classificar_intencao(pergunta_norm: str) -> str:
    if tem_palavra(pergunta_norm, ["cor", "de que cor", "estado", "aberta", "fechada", "escrito", "leia", "texto", "rotulo", "rótulo", "tamanho", "altura", "alta", "alto", "largura", "comprimento", "grande", "pequena"]):
        return "ATRIBUTO"
    if tem_palavra(pergunta_norm, ["quantos", "quantas", "quantidade", "quant", "contar"]):
        return "CONTAR"
    if tem_palavra(pergunta_norm, ["tem", "existe", "ha", "alguem", "alguém"]):
        return "EXISTE"
    if tem_palavra(pergunta_norm, ["onde", "cade", "cadê", "local", "localiza"]):
        return "LOCALIZAR"
    return "GERAL"
