# 1. Cria o ambiente virtual

python -m venv .venv

# 2. Ativa o ambiente virtual

.\.venv\Scripts\Activate.ps1

# 3. Instala tudo o que está listado no requirements.txt de uma só vez

pip install -r requirements.txt

# 4. Tesseract no Windows

Se o OCR for usado, instale o Tesseract OCR para Windows e confirme no PATH:

- Download: https://github.com/UB Mannheim/Windows releases
- Instale e confirme com: `tesseract --version`
- Para português do Brasil, use o idioma `por` nas configurações do OCR.
