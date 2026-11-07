# Farol — Documento Técnico de Implementação

Sistema de descrição de ambiente por imagem para pessoas com deficiência visual (baixa visão a cegueira).

**Stack:** Python + venv · YOLO (Ultralytics) · Ollama com `gemma3:4b` · skills em Markdown (`SKILL.md`) · App/front como cliente.

> **Estado de partida:** implementação do zero. Nenhum componente (YOLO, filtros, filas, skills) existe ainda. Este documento define a lógica e a ordem de construção.

---

## 1. Objetivo e escopo

O Farol observa o ambiente por câmera e **fala** para o usuário o que importa, no momento certo:

1. **Descrever o ambiente** (skill base).
2. **Avisar mudanças relevantes**, sem repetir o que já foi dito.
3. **Responder perguntas** (ativadas pelo comando de voz "Farol"): onde está um objeto, quantos, cor, estado, texto escrito.
4. **Alertar riscos** (escadas, poças, objetos cortantes etc.) com prioridade máxima, interrompendo tudo.

**Fora do escopo desta versão:** navegação/rota, reconhecimento facial, uso como substituto de bengala ou cão-guia. O sistema é um **auxílio**, nunca a única fonte de segurança (ver seção 13).

---

## 2. Princípios de projeto

| Princípio | Consequência prática |
|---|---|
| **YOLO é a fonte da verdade** | O LLM só narra o que o YOLO detectou; o prompt proíbe inventar objetos. |
| **LLM só quando necessário** | Perguntas de localização/contagem e "nada mudou" nunca chamam o Gemma. |
| **Silêncio ambíguo é perigoso** | Falha de qualquer parte gera mensagem explícita, nunca silêncio. |
| **Risco acima de tudo** | Risco lê o JSON bruto, tem fila própria de prioridade e corta a fala atual. |
| **Só o dado mais recente importa** | Frames: slot único. Mensagens: têm validade (TTL). Nada de backlog. |
| **Skills desacopladas** | Cada skill é um módulo com entrada/saída tipadas; comunicam-se pelo estado e pela fila. |
| **Prompts vivem em Markdown** | As skills de LLM (descrever ambiente, responder pergunta) são `SKILL.md`; um módulo pequeno (`skills.py`) carrega e injeta o conteúdo no modelo. O código não contém prompts. |
| **O código escolhe a skill** | Regras determinísticas decidem quando e qual skill rodar; o LLM nunca escolhe ferramentas. |
| **Configuração fora do código** | Limiares (confiança, tamanho, cooldown, pesos) em YAML. |

---

## 3. Arquitetura

### 3.1 Três camadas de execução

1. **Percepção (rápida, contínua):** captura → YOLO → JSON. Roda em loop próprio, não espera o LLM.
2. **Decisão (determinística, `.py`):** filtro, mudança, risco, roteador de pergunta. Milissegundos.
3. **Linguagem (lenta, sob demanda):** skills de LLM (`SKILL.md`, seção 5) executadas sobre o Ollama. Serializadas, com prioridade e cancelamento.

Essa separação é o que permite o risco funcionar "em paralelo": ele vive nas camadas 1 e 2 e **não depende** do Gemma para disparar.

### 3.2 Threads / tarefas

| Execução | Função |
|---|---|
| `T_captura` | Lê a câmera e publica no slot de frame (sobrescreve). |
| `T_percepcao` | Pega o último frame, roda YOLO+tracking, gera o JSON bruto. Chama risco e filtro. |
| `T_vlm` | **Único consumidor** do Ollama (`FilaLLM`). Lê uma fila de requisições priorizadas e canceláveis. |
| `T_saida` | Consome a fila de saída por prioridade e entrega ao App (WebSocket). |
| API (FastAPI) | Recebe perguntas (`POST /pergunta`) e publica mensagens (`WebSocket /ws`). |

---

## 4. Estrutura do projeto

```
farol/
├── requirements.txt
├── config/
│   └── farol.yaml                    # limiares, pesos, cooldowns, vocabulário de risco
├── skills/                           # skills em Markdown (somente as que usam LLM)
│   ├── descrever-ambiente/
│   │   └── SKILL.md
│   └── responder-pergunta/
│       └── SKILL.md
├── src/farol/
│   ├── main.py                       # orquestra threads e API
│   ├── contratos.py                  # dataclasses e enums (Deteccao, ObjetoTratado, MensagemSaida...)
│   ├── sessao.py                     # EstadoSessao + EstadoRisco
│   ├── captura.py                    # câmera + SlotFrame
│   ├── deteccao.py                   # YOLO + tracking -> lista de Deteccao
│   ├── filtro.py                     # filtro normal e linguagem espacial
│   ├── contexto.py                   # monta as variáveis que cada SKILL.md espera
│   ├── skills.py                     # carregar() os SKILL.md + executar() no Ollama
│   ├── fila_llm.py                   # worker único: prioridade e cancelamento
│   ├── fila_saida.py                 # fila de prioridade com TTL
│   ├── mudanca/
│   │   └── identificar_mudanca.py    # Python determinístico (não é SKILL.md)
│   ├── pergunta/
│   │   ├── roteador.py               # classificação de intenção
│   │   ├── vocabulario.py            # PT-BR -> classes do YOLO
│   │   └── fluxo_simples.py               # respostas por template, sem LLM
│   ├── risco/
│   │   ├── trigger.py                # cooldown e disparo
│   │   └── identificar_risco.py      # template de alerta (Python, não é SKILL.md)
│   └── api/
│       └── servidor.py               # FastAPI + WebSocket
├── tests/
├── gravacoes/                        # vídeos curtos para teste reprodutível
└── docs/
```

O **conteúdo** das skills de LLM vive em `skills/` (arquivos `SKILL.md`); o **mecanismo** são dois módulos pequenos, `skills.py` e `fila_llm.py`, sem camadas intermediárias. Mudança, risco, roteador de pergunta e Caminho 1 ficam em módulos Python próprios.

---

## 5. Skills em Markdown

### 5.1 Conceito

- Uma **skill** é uma pasta com um arquivo `SKILL.md`. O arquivo guarda o comportamento do LLM naquela tarefa: instruções, modelo, parâmetros. **O código Python não contém prompts.**
- Apenas **duas** skills usam LLM e viram `SKILL.md`: `descrever-ambiente` e `responder-pergunta`.
- Identificar mudança, identificar risco, roteador de pergunta e Caminho 1 são **Python determinístico**. Não são `SKILL.md`.
- **Quem escolhe a skill é o código**, não o modelo. Um modelo de 4B não deve decidir ferramentas: as regras (`deve_falar`, intenção da pergunta, risco) já decidiram antes de qualquer chamada.
- **Arquitetura enxuta, sem camadas intermediárias.** O mecanismo inteiro são dois módulos pequenos:
  - `skills.py`: lê os `SKILL.md` (`carregar`) e executa uma skill no Ollama (`executar`).
  - `fila_llm.py`: worker único com prioridade e cancelamento (necessário com ou sem Markdown).

```
Código do Farol (decide a skill)
        │  fila_llm.enfileirar(skill, variaveis, prioridade, imagem, modo)
        ▼
   FilaLLM (worker único, prioridade, cancelamento)
        │
        ▼
 skills.executar ──► preenche {{variáveis}} ──► ollama.chat(stream) ──► texto
```

### 5.2 Formato do SKILL.md

**Frontmatter (YAML):**

| Campo | Obrigatório | Descrição |
|---|---|---|
| `name` | sim | Igual ao nome da pasta. Identificador usado no código. |
| `description` | sim | Uma linha: o que a skill faz. |
| `version` | não | Inteiro; incremente a cada mudança de prompt e registre no log para comparar versões nos testes. |
| `model` | sim | Modelo do Ollama (ex.: `gemma3:4b`). |
| `options` | não | Parâmetros do modelo (`temperature`, `num_predict`...). O `num_predict` também limita o tamanho da resposta. |

**Corpo (Markdown), dividido por títulos `##`:**

- `## Sistema`: instruções fixas. **Não aceita variáveis** (nenhum `{{...}}`): texto vindo do usuário nunca entra aqui.
- `## Usuario`: template padrão da mensagem do usuário, com variáveis no formato `{{nome}}`.
- `## Usuario: <modo>`: variação opcional, escolhida pelo parâmetro `modo` na chamada.
- Os títulos são escritos sem acento (`Usuario`) para simplificar o parser.
- Não há lista de entradas no frontmatter: **todas as variáveis do template escolhido precisam ser passadas na chamada**. Se faltar uma, a execução falha com `KeyError`, e o nome da variável aparece no erro.

**`skills/descrever-ambiente/SKILL.md`**

````markdown
---
name: descrever-ambiente
description: Descreve o ambiente para uma pessoa que não enxerga, usando somente os objetos detectados pelo YOLO.
version: 1
model: gemma3:4b
options:
  temperature: 0.2
  num_predict: 120
---

## Sistema

Você descreve ambientes para uma pessoa que não enxerga.
Regras:
- Use SOMENTE os objetos da lista fornecida. Não invente objetos.
- Fale em segunda pessoa, com posição relativa ("à sua esquerda", "à sua frente").
- No máximo 3 frases curtas, em português do Brasil. Sem listas, sem emojis.
- Se a lista estiver vazia, diga que não identificou objetos relevantes.

## Usuario

Objetos detectados:
{{objetos}}

Descreva o ambiente.

## Usuario: atualizacao

Descrição anterior (já falada ao usuário):
{{descricao_anterior}}

O que mudou:
{{eventos}}

Objetos atuais:
{{objetos}}

Diga SOMENTE o que mudou, em uma frase curta. Não repita a descrição anterior.
````

**`skills/responder-pergunta/SKILL.md`**

````markdown
---
name: responder-pergunta
description: Responde a pergunta do usuário sobre um objeto (cor, estado, texto escrito) ou sobre a cena.
version: 1
model: gemma3:4b
options:
  temperature: 0.1
  num_predict: 100
---

## Sistema

Você responde perguntas de uma pessoa que não enxerga sobre o que aparece na imagem.
Regras:
- Responda só o que foi perguntado, em até 2 frases curtas, em português do Brasil.
- Se não conseguir ver ou ler com segurança, diga isso. Não adivinhe.
- Para texto escrito, transcreva exatamente o que estiver legível.
- Não invente objetos além dos informados no contexto.

## Usuario

Contexto (objetos detectados):
{{contexto}}

Pergunta: {{pergunta}}
````

A imagem enviada em `responder-pergunta` é o **recorte** do objeto (Caminho 2) ou o frame inteiro. Essa escolha é feita no código Python que chama a skill, não no `SKILL.md`.

### 5.3 `skills.py`

```python
import re
from pathlib import Path
import yaml, ollama

_VAR = re.compile(r"\{\{\s*(\w+)\s*\}\}")
_FRONT = re.compile(r"\A---\s*\n(.*?)\n---\s*\n(.*)\Z", re.DOTALL)
_TITULO = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)

def carregar(pasta="skills") -> dict[str, dict]:
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

Pontos de projeto:
- `modo` inexistente gera `KeyError` em `skill["usuario"][modo]`; variável faltando gera `KeyError` com o nome dela. Não há hierarquia de exceções: o orquestrador captura `Exception` e fala a mensagem de erro.
- O parâmetro `chat=ollama.chat` permite testar com uma função falsa, sem GPU e sem hierarquia de classes.
- Erros do Ollama (servidor fora do ar, modelo não baixado) sobem como exceção e seguem o mesmo caminho.

### 5.4 `fila_llm.py`

Único consumidor do modelo. Serializa as chamadas, respeita prioridade e cancela a tarefa em andamento quando chega algo mais urgente.

```python
@dataclass(order=True)
class Tarefa:
    prioridade: int                                  # menor = mais urgente
    seq: int
    skill: dict = field(compare=False)
    variaveis: dict = field(compare=False)
    imagem: bytes | None = field(compare=False, default=None)
    modo: str = field(compare=False, default="")
    ao_concluir: Callable[[str], None] = field(compare=False, default=None)
    ao_erro: Callable[[Exception], None] = field(compare=False, default=None)
    cancelar: threading.Event = field(compare=False, default_factory=threading.Event)


class FilaLLM:
    def __init__(self, chat=ollama.chat):
        self._chat = chat
        self._heap, self._seq = [], itertools.count()
        self._cv = threading.Condition()
        self._atual = None

    def enfileirar(self, skill, variaveis, prioridade, ao_concluir, ao_erro,
                   imagem=None, modo=""):
        tarefa = Tarefa(prioridade, next(self._seq), skill, variaveis,
                        imagem, modo, ao_concluir, ao_erro)
        with self._cv:
            heapq.heappush(self._heap, tarefa)
            if self._atual and prioridade < self._atual.prioridade:
                self._atual.cancelar.set()           # algo mais urgente chegou
            self._cv.notify()

    def cancelar_tudo(self):                         # usado pelo risco
        with self._cv:
            self._heap.clear()
            if self._atual:
                self._atual.cancelar.set()

    def loop(self):                                  # roda na thread T_vlm
        while True:
            with self._cv:
                while not self._heap:
                    self._cv.wait()
                self._atual = tarefa = heapq.heappop(self._heap)
            try:
                texto = skills.executar(tarefa.skill, tarefa.variaveis,
                                        imagem=tarefa.imagem, modo=tarefa.modo,
                                        cancelar=tarefa.cancelar, chat=self._chat)
                if texto is not None:                # None = cancelada
                    tarefa.ao_concluir(texto)
            except Exception as erro:
                tarefa.ao_erro(erro)                 # vira mensagem ERRO falada
            finally:
                with self._cv:
                    self._atual = None
```

Prioridades: `1` = `responder-pergunta`, `2` = `descrever-ambiente`. Tarefas de ambiente que esperaram na fila devem ser descartadas ao sair dela se o `frame_id` já estiver velho.

### 5.5 Como o Farol usa as skills

`contexto.py` transforma os dados do pipeline nas variáveis que cada skill espera:

```python
def texto_objetos(tratados) -> str:
    if not tratados:
        return "(nenhum objeto relevante)"
    return "\n".join(f"- {o.classe_pt}: {o.horizontal}, {o.distancia}" for o in tratados)

def texto_eventos(eventos) -> str:
    return "\n".join(f"- {e.tipo.lower()}: {e.classe} ({e.regiao}, {e.distancia})"
                     for e in eventos)

def vars_ambiente(tratados, decisao, estado) -> dict:
    return {"objetos": texto_objetos(tratados),
            "descricao_anterior": estado.ultima_descricao or "",
            "eventos": texto_eventos(decisao.eventos)}
```

Chamadas típicas (com `SKILLS = skills.carregar("skills")` feito na inicialização):

```python
# Descrição completa (descrição inicial ou mudança drástica)
fila_llm.enfileirar(SKILLS["descrever-ambiente"],
                    {"objetos": texto_objetos(tratados)},
                    prioridade=2, imagem=jpeg(frame),
                    ao_concluir=publicar_ambiente, ao_erro=publicar_erro)

# Atualização incremental (mudança pequena)
fila_llm.enfileirar(SKILLS["descrever-ambiente"],
                    contexto.vars_ambiente(tratados, decisao, estado),
                    modo="atualizacao", prioridade=2, imagem=jpeg(frame),
                    ao_concluir=publicar_ambiente, ao_erro=publicar_erro)

# Pergunta de Caminho 2 (cor, estado, texto escrito)
fila_llm.enfileirar(SKILLS["responder-pergunta"],
                    {"pergunta": pergunta, "contexto": texto_objetos(tratados)},
                    prioridade=1, imagem=jpeg(recorte_ou_frame),
                    ao_concluir=publicar_resposta, ao_erro=publicar_erro)
```

O texto devolvido vira `MensagemSaida.mensagem` (com `origem: VLM`). Qualquer exceção vira uma mensagem `ERRO` **falada** (`origem: ERRO`), nunca silêncio.

### 5.6 Regras e cuidados

- **Nova skill** = nova pasta com `SKILL.md`. `skills.py` não muda; só muda o código que a chama.
- **Texto do usuário** (a pergunta) entra apenas na seção `## Usuario`, nunca em `## Sistema`. O `carregar` rejeita variáveis no Sistema.
- **`version` no log:** registre skill, `version`, modo e duração de cada execução. Facilita comparar versões de prompt nos testes.
- **Recarregar prompts:** chamar `skills.carregar()` de novo devolve um dicionário novo; troque a referência. Se algum arquivo estiver inválido, a exceção impede a troca e o dicionário antigo continua valendo.
- **Skills que não são de LLM** (mudança, risco, roteador, Caminho 1) ficam fora de `skills.py` e são chamadas diretamente pelo orquestrador.
- **Quando adicionar camadas:** só se surgir um segundo backend de modelo (aí extrai-se uma interface de executor) ou se as skills de LLM passarem de umas cinco. Até lá, mais camadas seriam complexidade sem retorno.

---

## 6. Contratos de dados

### 6.1 Detecção (saída do YOLO, JSON bruto)

```python
@dataclass(frozen=True)
class Deteccao:
    frame_id: int
    id_track: int | None      # None se o tracker ainda não atribuiu ID
    classe: str               # nome COCO em inglês (ex.: "chair")
    conf: float               # 0..1
    x1: float; y1: float; x2: float; y2: float
    largura_frame: int
    altura_frame: int

    @property
    def area_rel(self) -> float:
        return ((self.x2 - self.x1) * (self.y2 - self.y1)) / (self.largura_frame * self.altura_frame)
```

### 6.2 Objeto tratado (entrada do LLM e das regras)

O YOLO entrega pixels; o LLM de 4B interpreta mal coordenadas. Converta antes:

```python
@dataclass(frozen=True)
class ObjetoTratado:
    id_track: int | None
    classe_pt: str            # "cadeira"
    classe_yolo: str          # "chair"
    horizontal: str           # "à esquerda" | "à frente" | "à direita"
    vertical: str             # "no alto" | "na altura da visão" | "embaixo"
    distancia: str            # "muito perto" | "perto" | "a média distância" | "longe"
    conf: float
    area_rel: float
```

Linha entregue ao modelo: `cadeira: à esquerda, perto (confiança 0,91)`.

### 6.3 Mensagem de saída (contrato único para todas as skills)

```python
class Prioridade(int, Enum):
    CRITICA = 1        # risco
    RESPOSTA = 2       # resposta a pergunta (Descrever Objeto)
    INFORMATIVA = 3    # descrição de ambiente

class Motivo(str, Enum):
    DESCRICAO_INICIAL = "DESCRICAO_INICIAL"
    OBJETO_NOVO = "OBJETO_NOVO"
    OBJETO_SAIU = "OBJETO_SAIU"
    MUDANCA_DRASTICA = "MUDANCA_DRASTICA"
    RISCO = "RISCO"
    RESPOSTA_PERGUNTA = "RESPOSTA_PERGUNTA"
    ERRO = "ERRO"

class Origem(str, Enum):
    VLM = "VLM"
    SOMENTE_YOLO = "SOMENTE_YOLO"
    ERRO = "ERRO"
```

```json
{
  "sessionId": "sessao18",
  "sequencia": 42,
  "frameId": 1380,
  "timestamp": 1761680000.12,
  "expiraEmMs": 4000,
  "status": "ok",
  "deveFalar": true,
  "interrompe": false,
  "prioridade": "INFORMATIVA",
  "motivo": "OBJETO_NOVO",
  "origem": "VLM",
  "idioma": "pt-BR",
  "mensagem": "Uma pessoa entrou à sua frente, perto.",
  "eventos": [{"tipo": "ENTROU", "classe": "pessoa", "regiao": "à frente", "distancia": "perto"}]
}
```

Regras do contrato:
- `sequencia` cresce por sessão; o front descarta mensagem com sequência menor que a última falada (exceto risco).
- `expiraEmMs`: mensagem velha é descartada em vez de falada fora de contexto.
- `interrompe: true` apenas para risco. A regra fica no backend, o front só obedece.
- `deveFalar: false` nunca gera fala.

### 6.4 Estado de sessão

Dividido em duas partes, porque têm ritmos de atualização diferentes:

```python
@dataclass(frozen=True)
class EstadoSessao:                 # atualizado no FIM de cada ciclo
    ultima_descricao: str | None
    objetos_rastreados: tuple       # snapshot dos tracks vistos
    ultimo_frame_id: int | None
    ultimo_json: tuple              # últimas detecções tratadas
    descricao_inicial_feita: bool
    sequencia: int

@dataclass
class EstadoRisco:                  # atualizado NO MOMENTO do alerta
    alertados: dict[int, "RiscoAlertado"]
```

```python
class Sessao:
    def __init__(self):
        self._estado = EstadoSessao(None, (), None, (), False, 0)
        self._lock = threading.Lock()
        self.risco = EstadoRisco(alertados={})

    def ler(self) -> EstadoSessao:
        return self._estado             # snapshot imutável: seguro para ler

    def atualizar(self, **mudancas):
        with self._lock:
            self._estado = replace(self._estado, **mudancas)
```

Por que imutável: com threads lendo e escrevendo, alterar campos soltos pode expor um estado pela metade (descrição nova com objetos antigos).
Por que o risco é separado: o cooldown precisa ser gravado no instante do alerta. Se esperasse o fim do ciclo (que pode demorar por causa do Gemma), o mesmo perigo seria alertado várias vezes.

---

## 7. Lógica dos módulos

### 7.1 Captura

- OpenCV (`cv2.VideoCapture`) em thread própria.
- **Slot de frame mais recente:** um único frame, sobrescrito. Nunca fila de frames.

```python
class SlotFrame:
    def __init__(self):
        self._lock = threading.Lock()
        self._dado = None
        self._contador = 0

    def publicar(self, frame):
        with self._lock:
            self._contador += 1
            self._dado = (self._contador, frame)

    def ultimo(self):
        with self._lock:
            return self._dado   # (frame_id, frame) ou None
```

Todo dado derivado de um frame carrega o `frame_id`. A imagem enviada ao Gemma e o JSON precisam ser **do mesmo frame**.

### 7.2 Detecção (YOLO + tracking)

```python
from ultralytics import YOLO

modelo = YOLO("yolo11n.pt")   # ou a versão mais recente do Ultralytics; comece pelo menor

def detectar(frame_id, frame):
    res = modelo.track(frame, persist=True, conf=0.20, verbose=False)[0]
    h, w = frame.shape[:2]
    out = []
    ids = res.boxes.id.int().tolist() if res.boxes.id is not None else [None] * len(res.boxes)
    for box, tid in zip(res.boxes, ids):
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        out.append(Deteccao(frame_id, tid, res.names[int(box.cls)], float(box.conf),
                            x1, y1, x2, y2, w, h))
    return out
```

- Use `conf` baixo aqui (JSON bruto). Quem endurece o limiar é o filtro, não o detector, porque o **risco precisa dos itens de baixa confiança**.
- O tracker (`track(..., persist=True)`) dá IDs estáveis entre frames: base da detecção de mudança.
- Não chame o YOLO em todo frame se não precisar; ver otimização opcional na seção 7.5.

### 7.3 Filtro JSON e linguagem espacial

**Filtro normal** (para descrição): mantém só objetos com `conf >= conf_min` e `area_rel >= area_min` (valores em `farol.yaml`, calibrados na Fase 1), ordenados por relevância (área e proximidade do centro), limitados a N itens (ex.: 8) para não estourar o prompt.

**Linguagem espacial:**

```python
def horizontal(cx, w):
    return "à esquerda" if cx < w / 3 else "à direita" if cx > 2 * w / 3 else "à frente"

def vertical(cy, h):
    return "no alto" if cy < h / 3 else "embaixo" if cy > 2 * h / 3 else "na altura da visão"

def distancia(area_rel):          # heurística: calibrar por classe na Fase 2
    if area_rel > 0.25: return "muito perto"
    if area_rel > 0.08: return "perto"
    if area_rel > 0.02: return "a média distância"
    return "longe"
```

Limitação conhecida: tamanho da caixa é um proxy ruim de distância (uma pessoa e uma garrafa têm tamanhos diferentes). Melhoria futura: altura de referência por classe.

**Filtro de risco:** função separada, com limiares mais permissivos e apenas as classes do vocabulário de risco (seção 7.8). Lê o JSON **bruto**.

### 7.4 Descrever ambiente (skill base)

Skill em Markdown: `skills/descrever-ambiente/SKILL.md` (seção 5.2). O prompt e os parâmetros do modelo (`temperature`, `num_predict`) vivem lá, não no código.

Entrada: lista de `ObjetoTratado` convertida em texto por `contexto.texto_objetos()` + imagem do mesmo frame. Saída: 1 a 3 frases em pt-BR.

Dois modos:
- **Padrão** (descrição inicial ou mudança drástica): descreve o ambiente do zero.
- **`atualizacao`**: recebe a descrição anterior + os eventos e diz só o que mudou, em uma frase.

Execução: `fila_llm.enfileirar(SKILLS["descrever-ambiente"], variaveis, prioridade=2, ...)` (seção 5.5). Temperatura baixa e limite de tokens reduzem alucinação e latência.

Teste obrigatório na Fase 4: comparar **com imagem** vs **só com o texto do YOLO** (basta chamar a skill sem o parâmetro `imagem`). Se a qualidade for parecida sem imagem, o modo só-texto é bem mais rápido.

### 7.5 Identificar mudança

Responsável por decidir **se** vale chamar o Gemma e **o que** dizer.

**Entrada:** detecções filtradas do ciclo atual + objetos rastreados no estado de sessão.
**Saída:** `{deve_falar, motivo, prioridade, eventos[]}`.

**Eventos (por ID de track):**

| Evento | Condição |
|---|---|
| `ENTROU` | ID novo visível por N frames consecutivos (persistência) |
| `SAIU` | ID ausente por M frames consecutivos |
| `MOVEU` | ID mudou de região (horizontal/distância) de forma significativa, só para classes relevantes |
| `MUDANCA_DRASTICA` | ≥ 70% dos IDs principais do estado anterior sumiram (regra do projeto) → redescrever do início |

**Pontuação (no `.py`, pesos no YAML):**

```
score = peso_tipo[evento] * peso_classe[classe] * peso_distancia[distancia] * peso_regiao[regiao]
deve_falar = score >= limiar  AND  (cooldown vencido OR prioridade alta)
```

- `ENTROU` pesa mais que `SAIU`.
- Pessoa, veículo e animal pesam mais que objetos estáticos.
- Perto e à frente pesam mais que longe e nas bordas.
- **Cooldown** global entre falas informativas; eventos de prioridade alta podem furá-lo.

**Dois modos de resposta quando `deve_falar` é verdadeiro:**
- `MUDANCA_DRASTICA` → skill `descrever-ambiente` no modo padrão (descrição completa).
- Mudança pequena → mesma skill `descrever-ambiente` com `modo="atualizacao"`: recebe a descrição anterior + `eventos` e responde só o que mudou, em uma frase.

**Otimização opcional:** diferença de pixels entre frames como gatilho **barato** para decidir se roda o YOLO naquele frame. A decisão de falar nunca depende só de pixels.

### 7.6 Pergunta (ativada por "Farol")

Pré-requisito: `descricao_inicial_feita == True`. Se a pergunta chegar antes, responder "Aguarde a primeira descrição".

**Fluxo:** o front detecta a palavra de ativação e converte voz em texto; envia `POST /pergunta`. A pergunta entra como **evento** (fila própria), não é verificada só no fim do ciclo.

**Roteador de intenção** (regras simples primeiro, sobre texto normalizado: minúsculas, sem acentos):

| Intenção | Exemplos | Caminho |
|---|---|---|
| `LOCALIZAR` | "onde está a mochila" | 1 (só JSON) |
| `EXISTE` | "tem alguém aqui" | 1 |
| `CONTAR` | "quantas pessoas" | 1 |
| `ATRIBUTO` | "de que cor é", "está aberta", "o que está escrito" | 2 (Gemma) |
| `GERAL` | qualquer outra | 2 |

```python
def normalizar(txt: str) -> str:
    txt = unicodedata.normalize("NFD", txt.lower())
    return "".join(c for c in txt if unicodedata.category(c) != "Mn").strip()
```

**Vocabulário PT-BR → classes YOLO** (com sinônimos):

```python
VOCAB = {
    "pessoa": "person", "alguem": "person",
    "cadeira": "chair", "mesa": "dining table",
    "garrafa": "bottle", "copo": "cup",
    "celular": "cell phone", "telefone": "cell phone",
    "controle": "remote", "mochila": "backpack",
    "geladeira": "refrigerator", "refrigerador": "refrigerator",
    "sofa": "couch", "televisao": "tv",
}
```

**Caminho 1 (sem LLM):** busca a classe no JSON do estado/último ciclo e responde por template ("A mochila está à sua esquerda, perto."). Se a palavra **não está no vocabulário** ou a classe **não existe no YOLO** (ex.: "porta"), cai para o Caminho 2.

**"Não achei" com honestidade:** não detectar não prova ausência. Resposta: "Não detectei uma garrafa agora. Tente girar a câmera." Nunca "não há garrafa".

**Caminho 2 (com LLM):** o filtro da pergunta localiza o objeto mencionado, **recorta a caixa com margem (~15%)** e envia o **recorte** + a pergunta à skill `responder-pergunta` (seção 5.5). Modelo de 4B lê cor e texto muito melhor num recorte do que na cena inteira, e fica mais rápido. Se o objeto não for localizável, envia a cena inteira com o JSON.

### 7.7 Fila de requisições e fala

Três filas distintas (não misturar):

**a) Entrada de frames:** slot único (7.1).

**b) Requisições ao modelo (`T_vlm`):** um único consumidor, a `FilaLLM` (seção 5.4).

| Prioridade | Tipo |
|---|---|
| 0 | Verificação de risco (`gemma3:4b`), se acionada (fora das skills em Markdown, ver seção 7.8) |
| 1 | Pergunta (Caminho 2, skill `responder-pergunta`) |
| 2 | Descrição de ambiente / atualização (skill `descrever-ambiente`) |

Cada requisição carrega um `threading.Event` de cancelamento. Se chegar algo de prioridade maior enquanto uma descrição de ambiente roda, ela é cancelada (uma descrição quase pronta já nasce desatualizada).

O cancelamento é feito dentro de `skills.executar`, que checa o evento a cada pedaço do stream e abandona a geração (seção 5.3).

> Teste na Fase 3 se interromper a leitura do stream realmente faz o Ollama parar de gerar na sua versão. Se não parar, o modelo continua ocupado até terminar, e isso muda o desenho do cancelamento.

**c) Saída/fala:** fila de prioridade com validade.

```python
class FilaSaida:
    def __init__(self):
        self._heap, self._seq = [], itertools.count()
        self._cv = threading.Condition()

    def publicar(self, msg):
        with self._cv:
            heapq.heappush(self._heap, (msg.prioridade, next(self._seq), msg))
            self._cv.notify()

    def proxima(self):
        with self._cv:
            while True:
                while not self._heap:
                    self._cv.wait()
                _, _, msg = heapq.heappop(self._heap)
                if not msg.expirada():
                    return msg
```

Regras de entrega ao front:
- **Risco (`interrompe: true`):** corta a fala atual imediatamente, limpa mensagens informativas pendentes.
- **Resposta de pergunta:** espera a frase atual terminar (não corta no meio) e passa na frente de qualquer descrição pendente.
- **Pergunta durante risco ativo:** espera o alerta terminar.
- Depois de um risco, marcar o contexto como **invalidado**: a próxima descrição de ambiente é completa, não incremental.

### 7.8 Identificar risco

**Gatilho (rápido, sem LLM):**

1. Recebe o **JSON bruto** (antes do filtro normal).
2. `Filtro de risco`: só classes do vocabulário de risco, com `conf` mais permissiva.
3. `Trigger.py` decide se dispara, com cooldown por ID.
4. Dispara: marca "risco ativo", cancela requisições em andamento, publica mensagem `CRITICA` com `interrompe: true`.
5. O texto do alerta sai de **template** a partir do YOLO ("Atenção: faca à sua frente, perto"). Latência mínima.
6. **Opcional/complementar:** o `gemma3:4b` confirma ou detalha depois. O alerta nunca espera o modelo. Essa verificação **não é uma skill em Markdown** (decisão do projeto: `SKILL.md` só para descrever ambiente e responder pergunta); se for implementada, chama `ollama.chat` diretamente, sem passar por `skills.py`.

**Cooldown:**

```python
def deve_alertar(id_risco, area, agora, estado_risco, cfg):
    anterior = estado_risco.alertados.get(id_risco)
    if anterior is None:
        return True                                         # risco novo
    if area > anterior.ultima_area * cfg.fator_aproximacao: # ex.: 1.3
        return True                                         # está se aproximando
    return (agora - anterior.ultimo_ts) > cfg.repetir_apos_s
```

**Cobertura real do YOLO:** o modelo padrão (COCO) **não tem** escada, degrau, buraco, poça nem piso molhado. **Degrau** é a exceção: já é coberto por um segundo modelo treinado (classe única `degrau`), descrito em `docs/farol-risco-degraus.md`. O que o COCO cobre bem para risco: `knife`, `scissors`, veículos (`car`, `truck`, `bus`, `motorcycle`, `bicycle`), entre outros.

| Fase do risco | Cobertura | Como |
|---|---|---|
| A (MVP) | Classes COCO relevantes | Vocabulário de risco no YAML |
| B | Poça, buraco, desnível (o **degrau** já está coberto pelo segundo modelo; ver `docs/farol-risco-degraus.md`) | Fine-tuning do YOLO com dataset próprio **ou** verificação periódica pelo `gemma3:4b` |

Princípio: no risco, **prefira falso positivo a falso negativo**.

### 7.9 App / API

- **FastAPI**; mensagens saem por **WebSocket** (`/ws`) porque o risco precisa ser empurrado, não consultado por polling.
- Entrada de pergunta: `POST /pergunta {"texto": "..."}`.
- O front implementa: leitura por voz (TTS), controle de interrupção, descarte por `sequencia`/`expiraEmMs`.
- O backend não fala; ele entrega mensagens com prioridade e a flag `interrompe`.

---

## 8. Ciclo completo (pseudocódigo)

```python
while rodando:
    item = slot.ultimo()
    if item is None: continue
    frame_id, frame = item

    bruto = detectar(frame_id, frame)                    # YOLO + tracking

    # 1) Risco (sempre, com JSON bruto)
    for r in filtro_risco(bruto):
        if trigger.deve_alertar(r, sessao.risco, agora):
            fila_llm.cancelar_tudo()
            fila_saida.publicar(msg_risco(r))            # prioridade CRITICA, interrompe
            sessao.atualizar(contexto_invalido=True)

    # 2) Descrição / mudança
    tratados = filtro_normal(bruto)
    estado = sessao.ler()
    decisao = identificar_mudanca(tratados, estado)
    if decisao.deve_falar:
        modo = "" if decisao.drastica else "atualizacao"
        fila_llm.enfileirar(
            SKILLS["descrever-ambiente"],
            contexto.vars_ambiente(tratados, decisao, estado),
            modo=modo, prioridade=2, imagem=jpeg(frame),
            ao_concluir=publicar_ambiente, ao_erro=publicar_erro)
    else:
        fila_saida.publicar(msg_silencio(frame_id))      # deveFalar = False

    # 3) Fim do ciclo: atualiza a sessão
    sessao.atualizar(ultimo_frame_id=frame_id, ultimo_json=tuple(tratados), ...)
```

Perguntas **não** estão no loop: chegam pela API, leem `sessao.ler()` e entram na `fila_llm` (skill `responder-pergunta`) ou respondem direto pelo Caminho 1.

---

## 9. Configuração (`config/farol.yaml`)

```yaml
yolo:
  modelo: yolo11n.pt
  conf_deteccao: 0.20        # JSON bruto (permissivo)

filtro:
  conf_min: 0.50
  area_min: 0.01
  max_objetos: 8

mudanca:
  frames_para_entrar: 3
  frames_para_sair: 5
  limiar_score: 0.6
  cooldown_informativo_s: 6
  fracao_drastica: 0.70
  pesos_classe: { person: 1.0, car: 1.0, dog: 0.9, chair: 0.4 }
  pesos_distancia: { "muito perto": 1.0, "perto": 0.8, "a média distância": 0.5, "longe": 0.2 }

risco:
  conf_min: 0.30
  fator_aproximacao: 1.3
  repetir_apos_s: 10
  classes: [knife, scissors, car, truck, bus, motorcycle, bicycle]

mensagens:
  expira_ms_informativa: 4000
  expira_ms_resposta: 8000

llm:
  pasta_skills: skills              # onde ficam os SKILL.md
  modelo_risco: gemma3:4b            # uso opcional; fora das skills em Markdown
  # modelo, temperatura e tokens de cada skill ficam no frontmatter do SKILL.md
```

Todos os valores são **ponto de partida**; calibre com gravações reais (Fase 9).

---

## 10. Plano de implementação (do zero)

Cada fase tem entregável e critério de aceite. Não avance sem cumprir o critério.

### Fase 0 — Ambiente
- Criar venv, instalar dependências, baixar modelos.

```bash
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install ultralytics opencv-python ollama fastapi "uvicorn[standard]" pyyaml pytest

ollama pull gemma3:4b        
```

- **Aceite:** webcam abre em um script de 5 linhas; `ollama run gemma3:4b` responde; YOLO detecta uma imagem de teste.

### Fase 1 — YOLO sozinho e medição
- Script que lê webcam/vídeo, roda YOLO e imprime/registra: classe, confiança, área, FPS, tempo por frame.
- Gravar 5 a 10 vídeos curtos de ambientes reais (cozinha, sala, rua, escada) em `gravacoes/`.
- **Aceite:** tabela com as classes que realmente aparecem, faixa de confiança típica, oscilação entre frames e FPS. Esses números definem `conf_min` e `area_min`.
- **Decisão a tomar aqui:** o COCO basta para o MVP? Quais perigos ficam sem cobertura?

### Fase 2 — Filtro e linguagem espacial
- `contratos.py`, `filtro.py`: `Deteccao` → `ObjetoTratado`, com grid e distância.
- Testes unitários (pytest) com detecções fabricadas.
- **Aceite:** para um frame conhecido, a saída em texto bate com o esperado ("cadeira: à esquerda, perto").

### Fase 3 — Skills, estado e filas (com mocks)
- `skills.py` (`carregar` + `executar`) e os dois `SKILL.md` (`descrever-ambiente`, `responder-pergunta`) — seção 5.
- `sessao.py`, `fila_saida.py` e `fila_llm.py` com cancelamento.
- Testes sem GPU passando uma função `chat` falsa (parâmetro `chat=`) para `executar` e para `FilaLLM`; a falsa pode devolver texto fixo ou dormir.
- Testes do loader: frontmatter ausente, `name` diferente da pasta, variável no `## Sistema`, modo inexistente, variável faltando (`KeyError`).
- Testar a questão do cancelamento do stream no Ollama real.
- **Aceite:** `executar` com `chat` falso devolve o template renderizado corretamente nos dois modos; skill inválida falha com erro claro; risco fictício corta uma descrição fictícia em andamento; mensagem expirada é descartada; pergunta passa na frente de ambiente.

### Fase 4 — Descrever ambiente via SKILL.md (ponta a ponta no console)
- `skills.executar` com o Ollama real; `contexto.py` montando as variáveis; `MensagemSaida` completa.
- Ajustar o prompt **no `SKILL.md`** (incrementando `version`); comparar com imagem vs só texto (chamando sem `imagem`); medir latência.
- **Aceite:** em 10 cenas gravadas, a descrição não cita objeto inexistente na lista; latência medida e registrada por `version` do prompt.

### Fase 5 — API e cliente mínimo
- FastAPI com `/ws` e `/pergunta`. Cliente de teste simples (página ou script) que imprime mensagens e aplica descarte por sequência/validade.
- **Aceite:** mensagens chegam por WebSocket com os campos do contrato; `sequencia` crescente.

### Fase 6 — Pergunta
- Roteador, vocabulário, Caminho 1 por template, Caminho 2 com recorte via skill `responder-pergunta`.
- Fallback do Caminho 1 para o 2; respostas de "não detectei".
- **Aceite:** conjunto de ~30 perguntas de teste classificadas corretamente; localizar/contar respondem sem chamar o Gemma.

### Fase 7 — Tracking e identificar mudança
- Ativar `track()`, estado por ID, eventos, pontuação, cooldown, persistência, mudança drástica.
- **Aceite:** em vídeo com pessoa entrando e saindo, o sistema fala na entrada e não repete; oscilação do YOLO não gera fala; objeto estático saindo de cena é tratado conforme os pesos.

### Fase 8 — Risco
- Filtro de risco, `Trigger.py` com cooldown, template de alerta, interrupção ponta a ponta.
- Fase B: dataset e fine-tuning (ou verificação com `gemma3:4b`) para poça/buraco (o degrau já é tratado em `docs/farol-risco-degraus.md`).
- **Aceite:** faca/veículo no vídeo gera alerta em tempo curto e medido; o mesmo risco não é repetido sem se aproximar; alerta corta qualquer fala em andamento.

### Fase 9 — Robustez, métricas e calibração
- Tratamento de erros (câmera cai, Ollama fora do ar → mensagem `ERRO` falada).
- Calibrar `farol.yaml` com as gravações; medir falas por minuto.
- **Teste com usuários reais** (baixa visão/cegueira) antes de qualquer uso fora do laboratório.

---

## 11. Testes e métricas

| Métrica | Alvo inicial (a validar) |
|---|---|
| Latência YOLO por frame | medir na Fase 1 |
| Latência do alerta de risco (frame → mensagem) | a menor possível; medir e fixar meta |
| Latência de resposta de pergunta (Caminho 1) | quase imediata |
| Latência de descrição (Caminho com Gemma) | medir na Fase 4 |
| Falas informativas por minuto | evitar "tagarelice"; calibrar |
| Alucinação: objetos citados que não estavam na lista | zero em cenas de teste |
| Alertas de risco repetidos sem aproximação | zero |

**Testes reproduzíveis:** reproduzir os vídeos de `gravacoes/` como fonte de frames (mesma interface da câmera). Isso permite comparar versões e ajustar limiares sem depender de ambiente ao vivo.

**Testes das skills e da fila:** passando uma função `chat` falsa, dá para testar loader, renderização de templates, fila, prioridade e cancelamento sem GPU e sem Ollama. Toda mudança de prompt incrementa `version` no `SKILL.md` e roda o mesmo conjunto de cenas gravadas.

---