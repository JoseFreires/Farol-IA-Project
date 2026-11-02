```python
import re # biblioteca para expressões regulares (regex)
from pathlib import Path  # biblioteca para caminhos do sistema
import yaml, ollama  #interpretar yml e comunicação com Ollama local

_VAR = re.compile(r"\{\{\s*(\w+)\s*\}\}") #Localiza e captura os nomes das variáveis delimitadas por chavetas duplas nos templates.
_FRONT = re.compile(r"\A---\s*\n(.*?)\n---\s*\n(.*)\Z", re.DOTALL) #Divide o ficheiro entre o cabeçalho YAML (metadados) e o corpo de texto Markdown

_TITULO = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE) #Identifica os títulos secundários (`##`) para segmentar o documento em secções.

""" Le as skills e agrupa as  sessoes chave em variaveis correspondentes, variavel disponibilizada, titulo, corpo... """

def carregar(pasta="skills") -> dict[str, dict]: #dicionárop agrupador das instruções
    """Lê skills/*/SKILL.md. Chame na inicialização (ou de novo para recarregar)."""
    skills = {}
    for arq in sorted(Path(pasta).glob("*/SKILL.md")):
        m = _FRONT.match(arq.read_text(encoding="utf-8"))
        if not m:
            raise ValueError(f"{arq}: frontmatter ausente")
        meta, texto = yaml.safe_load(m.group(1)), m.group(2)

        marcas = list(_TITULO.finditer(texto))
        secoes = {}
        for i, t in enumerate(marcas):
            fim = marcas[i + 1].start() if i + 1 < len(marcas) else len(texto)
            secoes[t.group(1).strip().lower()] = texto[t.end():fim].strip()

        if meta["name"] != arq.parent.name:
            raise ValueError(f"{arq}: 'name' deve ser igual ao nome da pasta")
        if "sistema" not in secoes or "usuario" not in secoes:
            raise ValueError(f"{arq}: faltam '## Sistema' e '## Usuario'")
        if _VAR.search(secoes["sistema"]):
            raise ValueError(f"{arq}: '## Sistema' não aceita variáveis")

        skills[meta["name"]] = {
            **meta,
            "sistema": secoes["sistema"],
            "usuario": {k.partition(":")[2].strip(): v          # "" = modo padrão
                        for k, v in secoes.items() if k.startswith("usuario")},
        }
    return skills

# Executa a skill enviando o prompt formatado e a imagem opcional para o Ollama
# processando a resposta em stream com suporte a cancelamento por thread e limpando o texto final.
def executar(skill, variaveis, imagem=None, modo="", cancelar=None, chat=ollama.chat):
    """Roda uma skill. Devolve o texto, ou None se foi cancelada."""
    usuario = _VAR.sub(lambda m: str(variaveis[m.group(1)]), skill["usuario"][modo])
    msg = {"role": "user", "content": usuario}
    if imagem:
        msg["images"] = [imagem]                                # JPEG em bytes

    partes = []
    for chunk in chat(model=skill["model"], stream=True, options=skill.get("options", {}),
                      messages=[{"role": "system", "content": skill["sistema"]}, msg]):
        if cancelar is not None and cancelar.is_set():
            return None                                         # abandona a geração
        partes.append(chunk["message"]["content"])
    return " ".join("".join(partes).split())
```