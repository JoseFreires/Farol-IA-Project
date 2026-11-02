import re
import unicodedata


def normalizar(texto: str) -> str:
    texto = unicodedata.normalize("NFD", texto.lower())
    return "".join(c for c in texto if unicodedata.category(c) != "Mn").strip()


CLASSES_PT = {
    "person": "pessoa",
    "bicycle": "bicicleta",
    "car": "carro",
    "motorcycle": "motocicleta",
    "airplane": "avião",
    "bus": "ônibus",
    "train": "trem",
    "truck": "caminhão",
    "boat": "barco",
    "traffic light": "semáforo",
    "fire hydrant": "hidrante",
    "stop sign": "placa de pare",
    "parking meter": "parquímetro",
    "bench": "banco",
    "bird": "pássaro",
    "cat": "gato",
    "dog": "cachorro",
    "horse": "cavalo",
    "sheep": "ovelha",
    "cow": "vaca",
    "elephant": "elefante",
    "bear": "urso",
    "zebra": "zebra",
    "giraffe": "girafa",
    "backpack": "mochila",
    "umbrella": "guarda-chuva",
    "handbag": "bolsa",
    "tie": "gravata",
    "suitcase": "maleta",
    "frisbee": "frisbee",
    "skis": "esquis",
    "snowboard": "prancha de neve",
    "sports ball": "bola esportiva",
    "kite": "pipa",
    "baseball bat": "bastão de beisebol",
    "baseball glove": "luva de beisebol",
    "skateboard": "skate",
    "surfboard": "prancha de surfe",
    "tennis racket": "raquete de tênis",
    "bottle": "garrafa",
    "plate": "prato",
    "wine glass": "copo",
    "cup": "xícara",
    "fork": "garfo",
    "knife": "faca",
    "spoon": "colher",
    "bowl": "tigela",
    "banana": "banana",
    "apple": "maçã",
    "sandwich": "sanduíche",
    "orange": "laranja",
    "broccoli": "brócolis",
    "carrot": "cenoura",
    "hot dog": "cachorro-quente",
    "pizza": "pizza",
    "donut": "rosquinha",
    "cake": "bolo",
    "chair": "cadeira",
    "couch": "sofá",
    "sofa": "sofá",
    "bed": "cama",
    "dining table": "mesa",
    "toilet": "banheiro",
    "tv": "televisão",
    "laptop": "notebook",
    "mouse": "mouse",
    "remote": "controle remoto",
    "keyboard": "teclado",
    "cell phone": "celular",
    "microwave": "micro-ondas",
    "oven": "forno",
    "toaster": "torradeira",
    "sink": "pia",
    "refrigerator": "geladeira",
    "book": "livro",
    "clock": "relógio",
    "vase": "vaso",
    "scissors": "tesoura",
    "teddy bear": "urso de pelúcia",
    "hair drier": "secador de cabelo",
    "toothbrush": "escova de dentes",
    "potted plant": "vaso com planta",
    "door": "porta",
    "window": "janela",
    "stair": "escada",
    "stairs": "escada",
    "step": "degrau",
    "puddle": "poça",
    "hole": "buraco",
}

VOCAB = {
    "pessoa": "person",
    "alguem": "person",
    "cadeira": "chair",
    "cadeiras": "chair",
    "mesa": "dining table",
    "mesas": "dining table",
    "garrafa": "bottle",
    "garrafas": "bottle",
    "copo": "cup",
    "copos": "cup",
    "celular": "cell phone",
    "telefone": "cell phone",
    "controles": "remote",
    "controle": "remote",
    "mochila": "backpack",
    "mochilas": "backpack",
    "geladeira": "refrigerator",
    "refrigerador": "refrigerator",
    "sofá": "couch",
    "sofa": "couch",
    "televisao": "tv",
    "televisão": "tv",
    "televisoes": "tv",
    "televisões": "tv",
    "carro": "car",
    "carros": "car",
    "caminhao": "truck",
    "caminhões": "truck",
    "moto": "motorcycle",
    "motos": "motorcycle",
    "bicicleta": "bicycle",
    "bicicletas": "bicycle",
    "escada": "degrau",
    "escadas": "degrau",
    "degrau": "degrau",
    "degraus": "degrau",
}

ARTIGO = {
    "person": "a",
    "chair": "a",
    "dining table": "a",
    "bottle": "a",
    "cup": "a",
    "cell phone": "o",
    "remote": "o",
    "backpack": "a",
    "refrigerator": "a",
    "couch": "o",
    "tv": "a",
    "car": "o",
    "truck": "o",
    "motorcycle": "a",
    "bicycle": "a",
    "escada": "a",
    "degrau": "o",
    "default": "o",
}

TERMO_EXIBICAO = {
    "sofa": "sofá",
    "televisao": "televisão",
    "televisão": "televisão",
    "alguem": "alguém",
    "person": "pessoa",
    "chair": "cadeira",
    "bottle": "garrafa",
    "cup": "copo",
    "remote": "controle",
    "backpack": "mochila",
    "refrigerator": "geladeira",
    "cell phone": "celular",
    "dining table": "mesa",
    "tv": "televisão",
    "car": "carro",
    "truck": "caminhão",
    "motorcycle": "motocicleta",
    "bicycle": "bicicleta",
    "escada": "escada",
    "degrau": "degrau",
}

DICIONARIO_TTS = {
    r"\bm\b": "metros",
    r"\bcm\b": "centímetros",
    r"\bkg\b": "quilos",
    r"(\d+)\s*m\b": r"\1 metros",
    r"(\d+)\s*cm\b": r"\1 centímetros",
    r"\bà esquerda\b": "à sua esquerda",
    r"\bà direita\b": "à sua direita",
    r"\bà frente\b": "bem à sua frente",
    r"\bà esquerda,\b": "à sua esquerda,",
    r"\bà direita,\b": "à sua direita,",
    r"\bà frente,\b": "bem à sua frente,",
}


def normalizar_para_tts(texto: str) -> str:
    if not texto:
        return ""

    texto_limpo = re.sub(r"\s+", " ", texto).strip()
    for padrao, substituicao in DICIONARIO_TTS.items():
        texto_limpo = re.sub(padrao, substituicao, texto_limpo, flags=re.IGNORECASE)
    texto_limpo = re.sub(r"(?<!bem )\bà frente\b", "bem à sua frente", texto_limpo, flags=re.IGNORECASE)
    texto_limpo = re.sub(r"\bbem bem à sua frente\b", "bem à sua frente", texto_limpo, flags=re.IGNORECASE)
    texto_limpo = re.sub(r"\bà sua frente\b", "bem à sua frente", texto_limpo, flags=re.IGNORECASE)
    return texto_limpo.strip()


def pluralizar(termo: str) -> str:
    if not termo:
        return termo
    termo = termo.strip()
    if termo.endswith("ao"):
        return termo[:-2] + "oes"
    if termo.endswith("ão"):
        return termo[:-2] + "ões"
    if termo.endswith("s") or termo.endswith("x") or termo.endswith("z"):
        return termo + "es"
    return termo + "s"


def achar_termo(pergunta_norm: str):
    pergunta_norm = normalize_texto(pergunta_norm)
    itens = sorted(VOCAB.items(), key=lambda item: len(item[0]), reverse=True)
    for termo_pt, classe_en in itens:
        base = normalize_texto(termo_pt)
        variantes = {base}
        for variacao in [base, pluralizar(base)]:
            variantes.add(variacao)
        for variante in sorted(variantes, key=len, reverse=True):
            padrao = r"(?<![a-záéíóúç])" + re.escape(variante) + r"(?![a-záéíóúç])"
            if re.search(padrao, pergunta_norm):
                termo_canonico = {
                    "escadas": "escada",
                    "degraus": "degrau",
                }.get(termo_pt, termo_pt)
                return termo_canonico, classe_en
    return None, None


def normalize_texto(texto: str) -> str:
    texto = unicodedata.normalize("NFD", texto.lower())
    return "".join(c for c in texto if unicodedata.category(c) != "Mn").strip()
