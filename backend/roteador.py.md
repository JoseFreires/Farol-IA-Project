from dataclasses import dataclass
from src.farol.pergunta.fluxo_simples import processar_caminho1, normalizar
from src.farol.pergunta.vocabulario import VOCAB

@dataclass
class DecisaoRoteamento:
    caminho: int              # 1 para determinístico (template), 2 para LLM (skill)
    resposta_direta: str | None = None  # Preenchido apenas se caminho == 1
    intencao: str = "GERAL"   # LOCALIZAR, EXISTE, CONTAR, ATRIBUTO, GERAL
    classe_alvo_en: str | None = None  # Nome da classe YOLO se identificada
    termo_pt: str | None = None        # Termo em PT-BR identificado

def classificar_intencao(pergunta_norm: str) -> str:
    """Classifica a intenção da pergunta com base em palavras-chave."""
    if any(p in pergunta_norm for p in ["cor", "de que cor", "estado", "aberta", "fechada", "escrito", "leia", "texto"]):
        return "ATRIBUTO"
    elif "quant" in pergunta_norm:
        return "CONTAR"
    elif any(p in pergunta_norm for p in ["tem", "existe", "ha", "alguem"]):
        return "EXISTE"
    elif any(p in pergunta_norm for p in ["onde", "cadê", "cade"]):
        return "LOCALIZAR"
    return "GERAL"

def rotear_pergunta(pergunta: str, objetos_tratados: list, estado_sessao) -> DecisaoRoteamento:
    """
    Roteia a pergunta do utilizador decidindo entre o Caminho 1 (rápido/template) 
    e o Caminho 2 (LLM / VLM).
    
    Args:
        pergunta: Frase enviada pelo utilizador.
        objetos_tratados: Lista de ObjetoTratado do ciclo atual.
        estado_sessao: EstadoSessao atual para verificar se a 1ª descrição já foi feita.
        
    Returns:
        DecisaoRoteamento: Objeto contendo a decisão e a resposta se resolvido no Caminho 1.
    """
    # Regra de proteção: Pergunta antes da descrição inicial
    if not estado_sessao.descricao_inicial_feita:
        return DecisaoRoteamento(
            caminho=1, 
            resposta_direta="Aguarde a primeira descrição do ambiente.",
            intencao="GERAL"
        )

    pergunta_norm = normalizar(pergunta)
    intencao = classificar_intencao(pergunta_norm)

    # Tenta identificar se há algum termo do vocabulário na pergunta
    termo_pt_encontrado = None
    classe_en_encontrada = None
    for termo_pt, classe_en in VOCAB.items():
        if termo_pt in pergunta_norm:
            termo_pt_encontrado = termo_pt
            classe_en_encontrada = classe_en
            break

    # Se for uma pergunta de ATRIBUTO (cor, texto, estado) ou GERAL, vai direto para o Caminho 2 (LLM)
    if intencao in ["ATRIBUTO", "GERAL"]:
        return DecisaoRoteamento(
            caminho=2,
            intencao=intencao,
            classe_alvo_en=classe_en_encontrada,
            termo_pt=termo_pt_encontrado
        )

    # Para LOCALIZAR, CONTAR e EXISTE, tenta resolver primeiro via Caminho 1
    resposta_template = processar_caminho1(pergunta, objetos_tratados)
    
    if resposta_template is not None:
        return DecisaoRoteamento(
            caminho=1,
            resposta_direta=resposta_template,
            intencao=intencao,
            classe_alvo_en=classe_en_encontrada,
            termo_pt=termo_pt_encontrado
        )

    # Se o Caminho 1 devolveu None (ex: palavra fora do vocabulário), vai para o Caminho 2 como fallback
    return DecisaoRoteamento(
        caminho=2,
        intencao=intencao,
        classe_alvo_en=classe_en_encontrada,
        termo_pt=termo_pt_encontrado
    )