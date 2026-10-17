from functools import lru_cache
from pathlib import Path

PASTA = Path(__file__).parent / "prompts"


@lru_cache
def montar_system(modo: str, detalhe: str = "normal") -> str:
    """Junta o prompt base, o do modo e, se existir, o do nível de detalhe.

    Os valores de `modo` e `detalhe` já chegam validados (Literal em schemas.py),
    então não há risco de acessar arquivos fora da pasta de prompts.
    """
    partes = [
        (PASTA / "base.txt").read_text(encoding="utf-8"),
        (PASTA / f"{modo}.txt").read_text(encoding="utf-8"),
    ]
    extra = PASTA / f"detalhe_{detalhe}.txt"
    if extra.exists():  # "normal" não tem arquivo: usa só o base e o do modo
        partes.append(extra.read_text(encoding="utf-8"))
    return "\n\n".join(partes)