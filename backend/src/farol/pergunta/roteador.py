from dataclasses import dataclass

from src.farol.pergunta.fluxo_simples import classificar_intencao, normalizar, processar_caminho1
from src.farol.pergunta.vocabulario import achar_termo


@dataclass
class DecisaoRoteamento:
    caminho: int
    resposta_direta: str | None = None
    intencao: str = "GERAL"
    classe_alvo_en: str | None = None
    termo_pt: str | None = None


def rotear_pergunta(pergunta: str, objetos_tratados: list, estado_sessao) -> DecisaoRoteamento:
    if not getattr(estado_sessao, "descricao_inicial_feita", False):
        return DecisaoRoteamento(caminho=1, resposta_direta="Aguarde a primeira descrição do ambiente.", intencao="GERAL")

    pergunta_norm = normalizar(pergunta)
    intencao = classificar_intencao(pergunta_norm)
    termo_pt, classe_en = achar_termo(pergunta_norm)

    if intencao == "CONTAR" and termo_pt == "degrau":
        return DecisaoRoteamento(
            caminho=1,
            resposta_direta="Não consigo informar a quantidade de degraus.",
            intencao=intencao,
            classe_alvo_en=classe_en,
            termo_pt=termo_pt,
        )

    if intencao in ["ATRIBUTO", "GERAL"]:
        return DecisaoRoteamento(caminho=2, intencao=intencao, classe_alvo_en=classe_en, termo_pt=termo_pt)

    resposta_template = processar_caminho1(pergunta, objetos_tratados, intencao=intencao, termo_pt=termo_pt, classe_en=classe_en)
    if resposta_template is not None:
        return DecisaoRoteamento(caminho=1, resposta_direta=resposta_template, intencao=intencao, classe_alvo_en=classe_en, termo_pt=termo_pt)

    return DecisaoRoteamento(caminho=2, intencao=intencao, classe_alvo_en=classe_en, termo_pt=termo_pt)
