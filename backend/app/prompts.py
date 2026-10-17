from functools import lru_cache
from pathlib import Path

PASTA = Path(__file__).parent / "prompts"


@lru_cache
def montar_system(modo: str) -> str:
    base = (PASTA / "base.txt").read_text(encoding="utf-8")
    especifico = (PASTA / f"{modo}.txt").read_text(encoding="utf-8")
    return f"{base}\n\n{especifico}"