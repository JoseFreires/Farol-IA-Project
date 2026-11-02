from dataclasses import dataclass, field
from typing import List
from collections import Counter

@dataclass
class EventoMudanca:
    tipo: str        # "ENTROU", "SAIU", "MUDANCA_DRASTICA"
    classe: str      # Nome em PT-BR (ex: "cadeira")
    regiao: str      # ex: "à frente"
    distancia: str   # ex: "perto"
    quantidade: int = 1

@dataclass
class DecisaoMudanca:
    deve_falar: bool
    motivo: str                    # DESCRICAO_INICIAL, OBJETO_NOVO, MUDANCA_DRASTICA, etc.
    prioridade: int                # Prioridade da mensagem (ex: 3 para informativa)
    drastica: bool = False         # Se True, exige descrição completa
    eventos: List[EventoMudanca] = field(default_factory=list)

def calcular_score_evento(tipo: str, classe_yolo: str, distancia: str, regiao: str, quantidade: int, cfg_mudanca: dict) -> float:
    """Calcula a pontuação de relevância de um evento com base nos pesos do YAML e quantidade de alterações."""
    pesos_classe = cfg_mudanca.get("pesos_classe", {})
    pesos_dist = cfg_mudanca.get("pesos_distancia", {})
    
    p_tipo = 1.2 if tipo == "ENTROU" else 0.6 if tipo == "SAIU" else 0.8
    p_classe = pesos_classe.get(classe_yolo, 0.5)
    p_dist = pesos_dist.get(distancia, 0.5)
    p_regiao = 1.0 if regiao == "à frente" else 0.7
    
    return p_tipo * p_classe * p_dist * p_regiao * quantidade

def identificar_mudanca(objetos_atuais: tuple, estado_sessao, cfg_mudanca: dict, agora: float) -> DecisaoMudanca:
    """
    Compara as detecções atuais com as anteriores usando Counter para calcular variações na contagem por classe/posição.
    """
    # 1. Primeira Descrição Obrigatorória
    if not estado_sessao.descricao_inicial_feita:
        return DecisaoMudanca(
            deve_falar=True,
            motivo="DESCRICAO_INICIAL",
            prioridade=3,
            drastica=True
        )

    anteriores = getattr(estado_sessao, "ultimo_json", ())
    
    # Cria os contadores baseados na chave (classe_yolo, classe_pt, regiao, distancia)
    counter_anterior = Counter(
        (o.classe_yolo, o.classe_pt, o.horizontal, o.distancia) for o in anteriores
    )
    counter_atual = Counter(
        (o.classe_yolo, o.classe_pt, o.horizontal, o.distancia) for o in objetos_atuais
    )

    # Se a contagem exata por categoria/região for idêntica, nada mudou
    if counter_anterior == counter_atual:
        return DecisaoMudanca(deve_falar=False, motivo="SEM_MUDANCA", prioridade=3)

    # 2. Mudança Drástica (Ex: desaparição massiva de categorias/objetos)
    total_anteriores = sum(counter_anterior.values())
    if total_anteriores >= 3:
        desaparecidos = sum((counter_anterior - counter_atual).values())
        if (desaparecidos / total_anteriores) >= cfg_mudanca.get("fracao_drastica", 0.70):
            return DecisaoMudanca(
                deve_falar=True,
                motivo="MUDANCA_DRASTICA",
                prioridade=3,
                drastica=True,
                eventos=[EventoMudanca(tipo="MUDANCA_DRASTICA", classe="ambiente", regiao="geral", distancia="geral")]
            )

    eventos = []
    score_total = 0.0

    # 3. Detecção de ENTRADAS (onde counter_atual > counter_anterior)
    diferenca_entradas = counter_atual - counter_anterior
    for (classe_yolo, classe_pt, regiao, distancia), qtd in diferenca_entradas.items():
        ev = EventoMudanca(
            tipo="ENTROU", 
            classe=classe_pt, 
            regiao=regiao, 
            distancia=distancia, 
            quantidade=qtd
        )
        eventos.append(ev)
        score_total += calcular_score_evento("ENTROU", classe_yolo, distancia, regiao, qtd, cfg_mudanca)

    # 4. Detecção de SAÍDAS (onde counter_anterior > counter_atual)
    diferenca_saidas = counter_anterior - counter_atual
    for (classe_yolo, classe_pt, regiao, distancia), qtd in diferenca_saidas.items():
        ev = EventoMudanca(
            tipo="SAIU", 
            classe=classe_pt, 
            regiao=regiao, 
            distancia=distancia, 
            quantidade=qtd
        )
        eventos.append(ev)
        score_total += calcular_score_evento("SAIU", classe_yolo, distancia, regiao, qtd, cfg_mudanca)

    # 5. Avaliação do Score vs Cooldown Informativo
    limiar_score = cfg_mudanca.get("limiar_score", 0.6)
    cooldown_s = cfg_mudanca.get("cooldown_informativo_s", 6)
    
    cooldown_vencido = True
    if hasattr(estado_sessao, "ultimo_ts_fala") and estado_sessao.ultimo_ts_fala:
        cooldown_vencido = (agora - estado_sessao.ultimo_ts_fala) >= cooldown_s

    deve_falar = (score_total >= limiar_score) and cooldown_vencido
    motivo = "OBJETO_NOVO" if any(e.tipo == "ENTROU" for e in eventos) else "MUDANCA_CENA"

    return DecisaoMudanca(
        deve_falar=deve_falar,
        motivo=motivo,
        prioridade=3,
        drastica=False,
        eventos=eventos
    )