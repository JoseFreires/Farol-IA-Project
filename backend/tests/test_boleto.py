from datetime import date

from app.boleto import validar_boleto

LINHA = "00190.50095 40144.816069 06809.350314 3 37370000000100"


def test_linha_valida():
    r = validar_boleto(LINHA, hoje=date(2008, 1, 5))
    assert r["valido"] is True
    assert r["valor"] == 1.0
    assert r["vencimento"] == date(2007, 12, 31)


def test_dv_errado():
    assert validar_boleto(LINHA.replace("40144.816069", "40144.816060"))["valido"] is False


def test_tamanho_errado():
    assert validar_boleto("123")["valido"] is False