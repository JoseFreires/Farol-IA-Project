import unicodedata
from src.farol.pergunta.vocabulario import VOCAB

def normalizar(txt: str) -> str:
    """Normaliza o texto removendo acentos e convertendo para minúsculas."""
    txt = unicodedata.normalize("NFD", txt.lower())
    return "".join(c for c in txt if unicodedata.category(c) != "Mn").strip()

def processar_caminho1(pergunta: str, objetos_tratados: list) -> str | None:
    """
    Processa perguntas simples (localizar, existência, contagem) usando templates, sem recorrer ao LLM (Caminho 1).
    
    Args:
        pergunta: Texto da pergunta feita pelo usuário.
        objetos_tratados: Lista de objetos tratados (`ObjetoTratado`) do último ciclo.
        
    Returns:
        str: Resposta formatada por template, ou None caso precise cair para o Caminho 2 (LLM).
    """
    pergunta_norm = normalizar(pergunta)
    
    # 1. Mapeia o termo em português da pergunta para a classe correspondente no YOLO (VOCAB)
    classe_alvo_en = None
    termo_encontrado = None
    for termo_pt, classe_en in VOCAB.items():
        if termo_pt in pergunta_norm:
            classe_alvo_en = classe_en
            termo_encontrado = termo_pt
            break
            
    # Se a palavra-chave não estiver mapeada no vocabulário, o Caminho 1 não resolve (cai para o Caminho 2 / LLM)
    if not classe_alvo_en:
        return None

    # Filtra os objetos atuais que correspondem à classe alvo procurada
    matches = [o for o in objetos_tratados if o.classe_yolo == classe_alvo_en]

    # 2. Identifica a intenção e monta a resposta por template
    
    # Intenção: CONTAR (ex: "quantas garrafas tem?")
    if "quant" in pergunta_norm:
        qtd = len(matches)
        if qtd == 0:
            return f"Não detectei {termo_encontrado} agora."
        elif qtd == 1:
            return f"Há apenas 1 {termo_encontrado}."
        else:
            return f"Há {qtd} {termo_encontrado}s."

    # Intenção: EXISTÊNCIA / PRESENÇA (ex: "tem alguém aqui?", "existe cadeira?")
    elif any(p in pergunta_norm for p in ["tem", "existe", "ha", "alguem"]):
        if matches:
            o = matches[0]
            return f"Sim, há {termo_encontrado} {o.horizontal}, {o.distancia}."
        else:
            return f"Não detectei {termo_encontrado} agora. Tente girar a câmera."

    # Intenção padrão: LOCALIZAR (ex: "onde está a mochila?")
    else:
        if matches:
            o = matches[0]
            return f"O/A {termo_encontrado} está {o.horizontal}, {o.distancia}."
        else:
            return f"Não detectei {termo_encontrado} agora. Tente girar a câmera."

    return None