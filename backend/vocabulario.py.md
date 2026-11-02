`import re

# Dicionário de tradução/mapeamento entre termos em português e as classes do YOLO (COCO)
VOCAB = {
    "pessoa": "person", "alguem": "person",
    "cadeira": "chair", "mesa": "dining table",
    "garrafa": "bottle", "copo": "cup",
    "celular": "cell phone", "telefone": "cell phone",
    "controle": "remote", "mochila": "backpack",
    "geladeira": "refrigerator", "refrigerador": "refrigerator",
    "sofa": "couch", "televisao": "tv",
}

# `Dicionário de substituições para melhorar a leitura do TTS (Síntese de Voz)`
DICIONARIO_TTS = {
    r"\bm\b": "metros",
    r"\bcm\b": "centímetros",
    r"\bkg\b": "quilos",
    r"(\d+)\s*m\b": r"\1 metros",
    r"(\d+)\s*cm\b": r"\1 centímetros",
    r"à esquerda": "à sua esquerda",
    r"à direita": "à sua direita",
    r"à frente": "bem à sua frente",
}

def normalizar_para_tts(texto: str) -> str:
    """
    Substitui abreviações e ajusta expressões textuais para garantir 
    uma entonação mais natural e compreensível pelo sintetizador de voz.
    """
    if not texto:
        return ""
    
    texto_limpo = texto
    for padrao, substituicao in DICIONARIO_TTS.items():
        texto_limpo = re.sub(padrao, substituicao, texto_limpo, flags=re.IGNORECASE)
        
    return texto_limpo`