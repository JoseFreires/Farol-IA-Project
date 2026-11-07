from __future__ import annotations

import csv
import time
from pathlib import Path

import cv2
from ultralytics import YOLO


def medir_video(caminho_video: str, modelo: str = "yolo26n.pt", conf: float = 0.25) -> list[dict]:
    model = YOLO(modelo)
    cap = cv2.VideoCapture(caminho_video)
    if not cap.isOpened():
        raise FileNotFoundError(f"Não foi possível abrir o vídeo: {caminho_video}")

    resultados: list[dict] = []
    inicio_total = time.perf_counter()
    contador = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        contador += 1
        t0 = time.perf_counter()
        pred = model(frame, conf=conf, verbose=False)[0]
        tempo_ms = (time.perf_counter() - t0) * 1000.0

        h, w = frame.shape[:2]
        for box in pred.boxes:
            cls = pred.names.get(int(box.cls[0]), str(int(box.cls[0])))
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            area = max(0.0, (x2 - x1) * (y2 - y1))
            area_rel = area / max(1.0, w * h)
            resultados.append(
                {
                    "frame": contador,
                    "classe": cls,
                    "conf": float(box.conf[0]),
                    "area_rel": area_rel,
                    "area_px": area,
                    "tempo_ms": tempo_ms,
                    "x1": x1,
                    "y1": y1,
                    "x2": x2,
                    "y2": y2,
                }
            )

    cap.release()
    total = time.perf_counter() - inicio_total
    fps = contador / total if total > 0 else 0.0
    print(f"frames={contador} fps={fps:.2f} tempo_total={total:.2f}s")
    return resultados


def salvar_csv(resultados: list[dict], csv_path: str | Path) -> None:
    campos = [
        "frame",
        "classe",
        "conf",
        "area_rel",
        "area_px",
        "tempo_ms",
        "x1",
        "y1",
        "x2",
        "y2",
    ]
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=campos)
        writer.writeheader()
        for linha in resultados:
            writer.writerow({k: linha.get(k, "") for k in campos})
    print(f"CSV salvo em: {csv_path}")


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Mede detecções do YOLO em um vídeo para calibrar conf_min e area_min.")
    parser.add_argument("--video", type=str, default="gravacoes/exemplo.mp4", help="Caminho para o vídeo ou webcam index.")
    parser.add_argument("--modelo", type=str, default="yolo26n.pt")
    parser.add_argument("--conf", type=float, default=0.25)
    parser.add_argument("--csv", type=str, default="gravacoes/medicao_yolo.csv")
    args = parser.parse_args()

    resultados = medir_video(args.video, modelo=args.modelo, conf=args.conf)
    salvar_csv(resultados, args.csv)


if __name__ == "__main__":
    main()
