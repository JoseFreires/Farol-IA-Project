import base64
import io
import os

try:
    import pytesseract
except ModuleNotFoundError:
    pytesseract = None

from PIL import Image

if pytesseract is not None:
    tesseract_path = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    if os.path.exists(tesseract_path):
        pytesseract.pytesseract.tesseract_cmd = tesseract_path


def ler_texto(imagem_base64: str) -> str:
    if pytesseract is None:
        return ""

    try:
        img = Image.open(io.BytesIO(base64.b64decode(imagem_base64)))
        return pytesseract.image_to_string(img, lang="por").strip()
    except Exception:
        return ""