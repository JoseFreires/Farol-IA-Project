import base64
import io

import pytesseract
from PIL import Image

# Ajuste se instalou em outro lugar
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"


def ler_texto(imagem_base64: str) -> str:
    try:
        img = Image.open(io.BytesIO(base64.b64decode(imagem_base64)))
        return pytesseract.image_to_string(img, lang="por").strip()
    except Exception:
        return ""