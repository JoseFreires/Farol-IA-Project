import asyncio, base64, json, sys, unicodedata
from pathlib import Path

RAIZ = Path(__file__).parent
sys.path.insert(0, str(RAIZ.parent / "backend"))

from app.schemas import DescreverRequest  # noqa: E402
from app.vision import descrever_stream   # noqa: E402


def norm(s: str) -> str:
    return unicodedata.normalize("NFD", s.lower()).encode("ascii", "ignore").decode()


async def main():
    casos = json.loads((RAIZ / "casos.json").read_text(encoding="utf-8"))
    acertos = 0
    for c in casos:
        b64 = base64.b64encode((RAIZ / c["arquivo"]).read_bytes()).decode()
        req = DescreverRequest(imagem_base64=b64, modo=c["modo"])
        texto = "".join([p async for p in descrever_stream(req)])
        faltando = [t for t in c["deve_conter"] if norm(t) not in norm(texto)]
        acertos += not faltando
        print("OK   " if not faltando else "FALHA", c["arquivo"], faltando)
    print(f"{acertos}/{len(casos)} casos corretos")


asyncio.run(main())