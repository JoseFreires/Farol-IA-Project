from __future__ import annotations

import argparse
import asyncio
import time

import cv2
import websockets


async def reproduzir(video: str, url: str, qualidade: int, loop: bool) -> None:
    cap = cv2.VideoCapture(video)
    if not cap.isOpened():
        raise FileNotFoundError(f"Não foi possível abrir o vídeo: {video}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    intervalo = 1.0 / max(fps, 1.0)
    enviados = 0
    proximo_frame = time.perf_counter()
    try:
        async with websockets.connect(url, max_size=None) as websocket:
            while True:
                ok, frame = cap.read()
                if not ok:
                    if not loop:
                        break
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    proximo_frame = time.perf_counter()
                    continue
                codificado, jpeg = cv2.imencode(
                    ".jpg",
                    frame,
                    [int(cv2.IMWRITE_JPEG_QUALITY), qualidade],
                )
                if not codificado:
                    raise RuntimeError(f"Falha ao codificar frame {enviados + 1}")
                await websocket.send(jpeg.tobytes())
                enviados += 1
                proximo_frame += intervalo
                await asyncio.sleep(max(0.0, proximo_frame - time.perf_counter()))
    finally:
        cap.release()

    print(f"Frames enviados: {enviados}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Reproduz um vídeo enviando frames ao WebSocket do Farol."
    )
    parser.add_argument("--video", required=True, help="arquivo de vídeo")
    parser.add_argument(
        "--url",
        default="ws://127.0.0.1:8000/ws/frames",
        help="URL do WebSocket de frames",
    )
    parser.add_argument("--jpeg-quality", type=int, default=80)
    parser.add_argument(
        "--loop",
        action="store_true",
        help="reinicia o vídeo ao chegar ao fim, até interromper com Ctrl+C",
    )
    args = parser.parse_args()
    if not 1 <= args.jpeg_quality <= 100:
        parser.error("--jpeg-quality deve estar entre 1 e 100")
    asyncio.run(reproduzir(args.video, args.url, args.jpeg_quality, args.loop))


if __name__ == "__main__":
    main()
