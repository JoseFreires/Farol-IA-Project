from __future__ import annotations

from typing import Sequence

from src.farol.contratos import ObjetoTratado
from src.farol.mudanca.identificar_mudanca import CLASSES_VIVAS, EventoMudanca


def evento_para_texto(evento) -> str:
    if isinstance(evento, str):
        return evento
    if evento is None:
        return ""

    tipo = getattr(evento, "tipo", "")
    classe = getattr(evento, "classe", "")
    regiao = getattr(evento, "regiao", "")
    distancia = getattr(evento, "distancia", "")
    quantidade = getattr(evento, "quantidade", 1)

    if not tipo:
        return str(evento)

    if tipo == "ENTROU":
        verbo = "entrou"
    elif tipo == "SAIU":
        verbo = "saiu"
    elif tipo == "IDENTIFICADO":
        return f"{classe.capitalize()} foi identificado no ambiente {regiao}."
    elif tipo == "MUDOU":
        verbo = "mudou"
    elif tipo == "MUDANCA_DRASTICA":
        return f"Mudança drástica no ambiente: {classe or 'ambiente'}."
    else:
        verbo = "mudou"

    if quantidade > 1:
        return f"{classe} {verbo} {quantidade} vezes em {regiao}, {distancia}."
    return f"{classe} {verbo} {regiao}, {distancia}."


def texto_eventos_python(
    eventos: Sequence[str] | Sequence[object],
    classes_inanimadas_anunciadas: set[str],
) -> str:
    textos = []
    for evento in eventos:
        if isinstance(evento, str) or evento is None:
            texto = evento_para_texto(evento)
        else:
            tipo = getattr(evento, "tipo", "")
            classe_yolo = getattr(evento, "classe_yolo", "")
            if not classe_yolo:
                texto = evento_para_texto(evento)
            elif classe_yolo in CLASSES_VIVAS:
                texto = evento_para_texto(evento) if tipo in {"ENTROU", "SAIU"} else ""
            elif tipo == "ENTROU" and classe_yolo not in classes_inanimadas_anunciadas:
                classes_inanimadas_anunciadas.add(classe_yolo)
                texto = evento_para_texto(
                    EventoMudanca(
                        tipo="IDENTIFICADO",
                        classe=getattr(evento, "classe", ""),
                        regiao=getattr(evento, "regiao", ""),
                        distancia=getattr(evento, "distancia", ""),
                        classe_yolo=classe_yolo,
                    )
                )
            else:
                texto = ""
        if texto:
            textos.append(texto)
    return " ".join(textos)


def texto_objetos(objetos: Sequence[ObjetoTratado], alertados=()) -> str:
    if not objetos:
        return "Nenhum objeto relevante detectado."

    alertas_ativos = set(alertados.keys() if isinstance(alertados, dict) else alertados)
    objetos_risco = [obj for obj in objetos if obj.risco]
    objetos_normais = [obj for obj in objetos if not obj.risco]
    por_posicao: dict[str, list[str]] = {}
    for obj in objetos_normais:
        por_posicao.setdefault(obj.horizontal, []).append(obj.classe_pt)

    partes = []
    for posicao, nomes in sorted(por_posicao.items(), key=lambda item: item[0]):
        nomes_unicos = []
        vistos = set()
        for nome in nomes:
            if nome not in vistos:
                vistos.add(nome)
                nomes_unicos.append(nome)
        if nomes_unicos:
            if len(nomes_unicos) == 1:
                partes.append(f"Há {nomes_unicos[0]} {posicao}.")
            else:
                ultima = nomes_unicos[-1]
                lista = ", ".join(nomes_unicos[:-1])
                partes.append(f"Há {lista} e {ultima} {posicao}.")
    for obj in objetos_risco:
        chave = f"{obj.classe_yolo}:{obj.horizontal}"
        estado_risco = "[risco, já avisado]" if chave in alertas_ativos else "[risco]"
        partes.append(
                f"{obj.classe_pt}: {obj.horizontal}, {obj.distancia} {estado_risco}"
        )
    if not partes:
        return "Nenhum objeto relevante detectado."
    return " ".join(partes)


def texto_eventos(eventos: Sequence[str] | Sequence[object]) -> str:
    if not eventos:
        return "Nenhuma mudança relevante detectada."
    return " ".join(evento_para_texto(ev) for ev in eventos if evento_para_texto(ev))


def vars_ambiente(
    objetos,
    descricao_anterior: str = "",
    eventos: Sequence[str] | Sequence[object] | None = None,
    alertados=(),
):
    posicoes_yolo: dict[str, list[str]] = {}
    for objeto in objetos:
        posicoes_yolo.setdefault(objeto.classe_pt, []).append(objeto.horizontal)
    return {
        "objetos": texto_objetos(objetos, alertados),
        "posicoes_yolo": posicoes_yolo,
        "descricao_anterior": descricao_anterior,
        "eventos": texto_eventos(eventos or []),
    }


def vars_pergunta(
    pergunta: str,
    tratados: Sequence[ObjetoTratado],
    texto_ocr: str | None = None,
    alertados=(),
) -> dict[str, object]:
    contexto = texto_objetos(tratados, alertados)
    posicoes_yolo: dict[str, list[str]] = {}
    for objeto in tratados:
        posicoes_yolo.setdefault(objeto.classe_pt, []).append(objeto.horizontal)
    if texto_ocr:
        contexto = f'{contexto}\nTexto lido por OCR: "{texto_ocr}"'
    return {
        "pergunta": pergunta,
        "contexto": contexto,
        "posicoes_yolo": posicoes_yolo,
    }
