import time
import cv2
import yaml
import ollama
from fastapi.testclient import TestClient

from src.farol.api.servidor import Deps, criar_app
from src.farol.captura import SlotFrame
from src.farol.fila_llm import FilaLLM
from src.farol.fila_saida import FilaSaida
from src.farol.sessao import Sessao
from src.farol.skills import carregar


def main():
    with open('config/farol.yaml', 'r', encoding='utf-8') as f:
        cfg = yaml.safe_load(f) or {}

    slot = SlotFrame()
    sessao = Sessao()
    skills = carregar('skills')
    fila_llm = FilaLLM(chat=ollama.chat)
    fila_saida = FilaSaida()
    app = criar_app(Deps(
        slot=slot,
        sessao=sessao,
        fila_llm=fila_llm,
        fila_saida=fila_saida,
        skills=skills,
        cfg=cfg,
        parar=None,
    ))

    client = TestClient(app)
    cap = cv2.VideoCapture('gravacoes/gravacao01.mp4')
    ok, frame = cap.read()
    cap.release()
    print('VIDEO_OK', ok)
    if not ok:
        return 1

    _, jpg = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    r1 = client.post('/frame', content=jpg.tobytes())
    print('FRAME_STATUS', r1.status_code, r1.json())

    r2 = client.post('/pergunta', json={'texto': 'farol onde está a cadeira'})
    print('PERGUNTA_STATUS', r2.status_code, r2.json())

    for i in range(30):
        time.sleep(1)
        msg = fila_saida.proxima(time.time())
        if msg is not None:
            print('SAIDA', msg.to_dict())
            break
    else:
        print('SAIDA', None)

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
