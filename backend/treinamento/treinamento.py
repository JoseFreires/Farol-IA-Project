from ultralytics import YOLO
import multiprocessing
from pathlib import Path

if __name__ == "__main__":
    multiprocessing.freeze_support()

    model = YOLO("yolo26n.pt")

    results = model.train(data=str(Path(__file__).resolve().with_name("data.yaml")),
    epochs=100,
    imgsz=640,
    batch=18,
    workers=0,
    patience=0,
    device="cpu")

    print ("Treinamento finalizado com sucesso!")
