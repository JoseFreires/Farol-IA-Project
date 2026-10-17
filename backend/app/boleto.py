from datetime import date, timedelta


def _dv_mod10(num: str) -> int:
    soma, peso = 0, 2
    for d in reversed(num):
        p = int(d) * peso
        soma += p // 10 + p % 10
        peso = 1 if peso == 2 else 2
    return (10 - soma % 10) % 10


def _dv_mod11(num: str) -> int:
    soma, peso = 0, 2
    for d in reversed(num):
        soma += int(d) * peso
        peso = 2 if peso == 9 else peso + 1
    dv = 11 - soma % 11
    return 1 if dv in (0, 10, 11) else dv


def _linha_para_barras(linha: str) -> str:
    return (linha[0:4] + linha[32] + linha[33:47]
            + linha[4:9] + linha[10:20] + linha[21:31])


def _vencimento(fator: int, hoje: date) -> date | None:
    if fator == 0:
        return None
    base = date(1997, 10, 7)
    # o fator reinicia a cada 9000 dias (desde fev/2025): escolhe a data mais próxima de hoje
    candidatas = [base + timedelta(days=fator), base + timedelta(days=fator + 9000)]
    return min(candidatas, key=lambda d: abs((d - hoje).days))


def validar_boleto(entrada: str, hoje: date | None = None) -> dict:
    hoje = hoje or date.today()
    d = "".join(c for c in entrada if c.isdigit())

    if len(d) == 48 or d.startswith("8"):
        return {"valido": False, "motivo": "Boletos de convênio e tributos ainda não são suportados."}

    if len(d) == 47:
        campos = (d[0:9], d[10:20], d[21:31])
        dvs = (d[9], d[20], d[31])
        if any(_dv_mod10(c) != int(dv) for c, dv in zip(campos, dvs)):
            return {"valido": False, "motivo": "Dígito verificador de um dos campos não confere."}
        barras = _linha_para_barras(d)
    elif len(d) == 44:
        barras = d
    else:
        return {"valido": False, "motivo": f"Quantidade de dígitos inesperada: {len(d)}."}

    if _dv_mod11(barras[:4] + barras[5:]) != int(barras[4]):
        return {"valido": False, "motivo": "Dígito verificador geral não confere."}

    return {
        "valido": True,
        "valor": round(int(barras[9:19]) / 100, 2),
        "vencimento": _vencimento(int(barras[5:9]), hoje),
        "banco": barras[0:3],
    }