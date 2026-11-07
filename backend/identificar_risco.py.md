`import cv2
from ultralytics import YOLO

# Definição de classes que exigem atenção especial (desníveis, pisos perigosos, etc.)
CLASSES_CRITICAS = ["stairs", "step", "puddle", "hole"]

def avaliar_risco(frame, modelo_yolo, limiar_aviso=0.10, limiar_atencao=0.25, limiar_colisao=0.25):
    """
    Avalia riscos em tempo real separando a lógica:
    - Classes críticas (degraus/buracos): usam gradação de Aviso e Atenção baseada na proximidade.
    - Demais objetos: usam limiar fixo de colisão (trombada).
    
    Args:
        frame: O frame atual capturado pela câmara.
        modelo_yolo: Instância do modelo YOLO.
        limiar_aviso: Proporção menor para alertar preventivamente sobre classes críticas.
        limiar_atencao: Proporção maior para alerta crítico de classes críticas.
        limiar_colisao: Proporção fixa para evitar choque com objetos comuns (padrão 25%).
        
    Returns:
        tuple (str or None, str or None): (Nível do Alerta, Mensagem formatada)
    """
    if frame is None:
        return None, None

    resultados = modelo_yolo(frame, verbose=False)
    
    altura_frame, largura_frame = frame.shape[:2]
    area_total_frame = altura_frame * largura_frame

    for r in resultados:
        for box in r.boxes:
            cls_id = int(box.cls[0])
            nome_classe = modelo_yolo.names[cls_id]
            
            coords = box.xyxy[0].tolist()
            x1, y1, x2, y2 = coords
            area_objeto = (x2 - x1) * (y2 - y1)
            proporcao = area_objeto / area_total_frame

            # 1. Lógica para Classes Críticas (Degraus/Desníveis) com gradação
            if nome_classe in CLASSES_CRITICAS:
                if proporcao > limiar_atencao:
                    return "ATENCAO", f"Atenção! {nome_classe} muito próximo à frente."
                elif proporcao > limiar_aviso:
                    return "AVISO", f"Aviso: {nome_classe} à frente."

            # 2. Lógica Padrão para Evitar Choque (Trombada) com objetos comuns
            else:
                if proporcao > limiar_colisao:
                    return "ATENCAO", f"Cuidado! {nome_classe} muito próximo à frente."

    return None, None`