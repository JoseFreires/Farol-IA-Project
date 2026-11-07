import re
import unicodedata
from pathlib import Path

import ollama
import yaml

_VAR = re.compile(r"\{\{\s*(\w+)\s*\}\}")
_FRONT = re.compile(r"\A---\s*\n(.*?)\n---\s*\n(.*)\Z", re.DOTALL)
_TITULO = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)
_ALERTA = re.compile(r"\b(?:atenção|aviso|cuidado|perigo)\b", re.IGNORECASE)
_POSICAO = re.compile(
    r"\b(?:à|a)\s+(?:sua\s+)?(esquerda|direita|frente)\b",
    re.IGNORECASE,
)


def _normalizar(texto: str) -> str:
    return unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode().lower()


def _padrao_entidade(nome: str) -> re.Pattern:
    partes = re.findall(r"[a-z0-9]+", _normalizar(nome))
    if not partes:
        return re.compile(r"(?!)")
    corpo = r"[\s-]*".join(re.escape(parte) for parte in partes)
    return re.compile(rf"(?<!\w){corpo}s?(?!\w)", re.IGNORECASE)


def _corrigir_posicoes(texto: str, posicoes_yolo: dict[str, list[str]]) -> str:
    if not texto or not posicoes_yolo:
        return texto

    padroes = {nome: _padrao_entidade(nome) for nome in posicoes_yolo}
    frases = re.split(r"(?<=[.!?])\s+", texto)
    resultado = []
    indices_entidades = {nome: 0 for nome in posicoes_yolo}

    for frase in frases:
        ocorrencias_entidades = {
            nome: list(padrao.finditer(frase))
            for nome, padrao in padroes.items()
        }
        entidades = sorted(
            (
                (ocorrencia.start(), nome)
                for nome, ocorrencias in ocorrencias_entidades.items()
                for ocorrencia in ocorrencias
            ),
            key=lambda item: item[0],
        )
        if not entidades:
            resultado.append(frase)
            continue

        ocorrencias = list(_POSICAO.finditer(frase))
        posicoes_alvo = []
        for _, nome in entidades:
            posicoes = posicoes_yolo[nome]
            indice = indices_entidades[nome]
            posicoes_alvo.append(posicoes[min(indice, len(posicoes) - 1)])
            indices_entidades[nome] = indice + 1

        if not ocorrencias:
            resultado.append(frase)
            continue

        if len(set(posicoes_alvo)) == 1:
            posicoes_substitutas = [posicoes_alvo[0]]
        elif len(ocorrencias) >= len(posicoes_alvo):
            posicoes_substitutas = posicoes_alvo
        else:
            resultado.append(frase)
            continue

        partes = []
        inicio = 0
        for indice, ocorrencia in enumerate(ocorrencias):
            partes.append(frase[inicio:ocorrencia.start()])
            if indice < len(posicoes_substitutas):
                posicao = posicoes_substitutas[indice]
                substituicao = f"à sua {posicao.removeprefix('à ')}"
                if ocorrencia.start() == 0 and frase[:1].isupper():
                    substituicao = substituicao.capitalize()
                partes.append(substituicao)
            inicio = ocorrencia.end()
        partes.append(frase[inicio:])
        frase_corrigida = "".join(partes)
        frase_corrigida = re.sub(r"\s+([,.!?;:])", r"\1", frase_corrigida)
        frase_corrigida = re.sub(r"\s{2,}", " ", frase_corrigida).strip()
        resultado.append(frase_corrigida)

    return " ".join(resultado)


def _remover_alertas_de_descricao(texto: str) -> str:
    frases = re.split(r"(?<=[.!?])\s+", texto)
    return " ".join(
        frase.strip() for frase in frases
        if frase.strip() and not _ALERTA.search(frase)
    )


def carregar(pasta="skills") -> dict[str, dict]:
    """Lê skills/*/SKILL.md. Chame na inicialização (ou de novo para recarregar)."""
    skills = {}
    for arq in sorted(Path(pasta).glob("*/SKILL.md")):
        texto = arq.read_text(encoding="utf-8")
        match = _FRONT.match(texto)
        if not match:
            raise ValueError(f"{arq}: frontmatter ausente")
        meta, corpo = yaml.safe_load(match.group(1)), match.group(2)

        marcas = list(_TITULO.finditer(corpo))
        secoes = {}
        for i, titulo in enumerate(marcas):
            fim = marcas[i + 1].start() if i + 1 < len(marcas) else len(corpo)
            secoes[titulo.group(1).strip().lower()] = corpo[titulo.end():fim].strip()

        if meta["name"] != arq.parent.name:
            raise ValueError(f"{arq}: 'name' deve ser igual ao nome da pasta")
        if "sistema" not in secoes or "usuario" not in secoes:
            raise ValueError(f"{arq}: faltam '## Sistema' e '## Usuario'")
        if _VAR.search(secoes["sistema"]):
            raise ValueError(f"{arq}: '## Sistema' não aceita variáveis")

        skills[meta["name"]] = {
            **meta,
            "sistema": secoes["sistema"],
            "usuario": {
                k.partition(":")[2].strip(): v
                for k, v in secoes.items()
                if k.startswith("usuario")
            },
        }
    return skills


def executar(skill, variaveis, imagem=None, modo="", cancelar=None, chat=ollama.chat):
    """Roda uma skill. Devolve o texto, ou None se foi cancelada."""
    usuario = _VAR.sub(lambda m: str(variaveis[m.group(1)]), skill["usuario"][modo])
    msg = {"role": "user", "content": usuario}
    if imagem:
        msg["images"] = [imagem]

    partes = []
    for chunk in chat(
        model=skill["model"],
        stream=True,
        keep_alive="30m",
        options=skill.get("options", {}),
        messages=[{"role": "system", "content": skill["sistema"]}, msg],
    ):
        if cancelar is not None and cancelar.is_set():
            return None
        partes.append(chunk["message"]["content"])
    texto = " ".join("".join(partes).split())
    if skill.get("name") == "descrever-ambiente":
        texto = _remover_alertas_de_descricao(texto)
        texto = _corrigir_posicoes(texto, variaveis.get("posicoes_yolo", {}))
    return texto
