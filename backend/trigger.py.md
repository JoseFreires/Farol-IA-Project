import time
from dataclasses import dataclass

@dataclass
class RiscoAlertado:
    ultima_area: float
    ultimo_ts: float

def deve_alertar(id_risco: int, area: float, agora: float, estado_risco, fator_aproximacao: float = 1.3, repetir_apos_s: int = 10) -> bool:
    """
    Decide se um risco detetado deve disparar um novo alerta com base no cooldown
    e na aproximação do objeto (variação da área da caixa delimitadora).
    
    Args:
        id_risco: ID do track do objeto (ou ID temporal se não houver tracker).
        area: Proporção ou tamanho da área atual da caixa delimitadora.
        agora: Timestamp atual (ex: time.time()).
        estado_risco: Instância de EstadoRisco contendo os alertas anteriores.
        fator_aproximacao: Multiplicador de crescimento da área (ex: 1.3 = 30% maior).
        repetir_apos_s: Tempo limite em segundos para forçar a repetição do alerta.
    """
    anterior = estado_risco.alertados.get(id_risco)
    
    # 1. Se é um risco novo que nunca foi alertado
    if anterior is None:
        return True                                         
        
    # 2. Se o objeto cresceu o suficiente, significa que está a aproximar-se perigosamente
    if area > anterior.ultima_area * fator_aproximacao:     
        return True                                         
        
    # 3. Se já passou tempo suficiente desde o último aviso do mesmo objeto
    if (agora - anterior.ultimo_ts) > repetir_apos_s:       
        return True                                         
        
    return False