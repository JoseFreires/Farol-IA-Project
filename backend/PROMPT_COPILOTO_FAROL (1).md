# PROMPT — Construir o backend do Farol (integrar `src/` pendente)

> Cole este arquivo inteiro no copiloto. Antes, deixe no repositório:
> - `docs/farol-documento-tecnico.md` (a doc técnica)
> - `docs/farol-risco-degraus.md` (segundo modelo YOLO: classe `degrau`)
> - `models/degraus.pt` (pesos treinados do detector de degrau)
> - `_referencia/` com os arquivos de código já escritos (lista na seção 4)

---

## 1. Papel e objetivo

Você é um engenheiro Python sênior implementando o **Farol**: sistema que observa o ambiente por câmera e **fala** para uma pessoa com deficiência visual o que importa, no momento certo (descrever ambiente, avisar mudanças relevantes, responder perguntas, alertar riscos).

O desenho já está pronto na doc técnica e parte do código já existe. **Sua tarefa:**

1. Criar os módulos de `src/farol/` que **ainda não existem**.
2. Mover os módulos **já escritos** para o lugar certo e **integrá-los** (com os ajustes obrigatórios da seção 5).
3. Entregar o ciclo completo funcionando: câmera → YOLO → regras → fila LLM → fila de saída → WebSocket.

Trabalhe **por fases** (seção 7). Ao final de cada fase, **pare**, rode os testes e reporte (seção 9). Não avance sem o critério de aceite.

---

## 2. Fontes de verdade e precedência

Quando houver conflito, vale esta ordem:

1. **Seção 5 deste prompt** (divergências já analisadas entre doc e código).
2. **`docs/farol-documento-tecnico.md`**: arquitetura, contratos (seção 6 da doc), ciclo (seção 8), fases (seção 10).
   **`docs/farol-risco-degraus.md`** complementa a doc técnica **só** em detecção e risco de degrau; onde os dois tratarem do mesmo ponto (7.2 e 7.8 da doc principal), vale o de degraus.
3. **Código em `_referencia/`**: lógica já escrita e validada pelo autor.
4. **`config/farol.yaml`**: valores numéricos e nomes de modelo do YAML prevalecem sobre exemplos da doc (ex.: `yolo26n.pt` e `conf_deteccao: 0.25` do YAML, não `yolo11n` / `0.20` da doc).

Se encontrar uma ambiguidade **não coberta aqui**: escolha a opção mais simples, siga em frente e registre em `docs/decisoes.md` (data, contexto, escolha, alternativa descartada). Não pare para perguntar por detalhes; pare apenas pelas "Decisões em aberto" (seção 11) se bloquearem a fase.

---

## 3. Regras inegociáveis

1. **YOLO é a fonte da verdade.** O LLM só narra o que o YOLO detectou. Nunca crie caminho em que o LLM decida *o que existe* na cena.
2. **O código escolhe a skill; o LLM nunca escolhe ferramenta.**
3. **Nenhum prompt dentro do `.py`.** Prompts vivem em `skills/*/SKILL.md`. Só existem **duas** skills de LLM: `descrever-ambiente` e `responder-pergunta`. Mudança, risco, roteador e Caminho 1 são Python determinístico.
4. **Risco lê o JSON bruto, nunca espera o LLM**, tem prioridade máxima, corta a fala e cancela a fila do LLM.
5. **Só o dado mais recente importa:** frames em slot único (sobrescreve), mensagens com TTL, sem backlog.
6. **Silêncio ambíguo é perigoso:** qualquer falha vira mensagem `ERRO` explícita; nunca engula exceção em silêncio.
7. **Honestidade no "não achei":** nunca "não há garrafa"; sempre "Não detectei garrafa agora. Tente girar a câmera."
8. **Configuração fora do código:** limiares, pesos, cooldowns e modelos em `config/farol.yaml` (ou no frontmatter do `SKILL.md`). Nada de número mágico no código sem default documentado.
9. **Imagem e JSON do mesmo frame:** tudo derivado de um frame carrega `frame_id`; a imagem enviada ao VLM tem de ser do frame que gerou o JSON.
10. **Estado imutável + threads:** `EstadoSessao` é `frozen` e só muda via `Sessao.atualizar(**mudancas)`.
11. **Idioma:** código, docstrings e comentários em **português do Brasil** (como o código existente); mensagens ao usuário em `pt-BR`.
12. **Rotas separadas por responsabilidade (seção 6.10):** a rota de **frames** só recebe bytes e alimenta o YOLO; a rota de **perguntas** é a única iniciada pelo usuário e a única que pode acionar o Gemma sob demanda; a saída é uma terceira rota. Nenhuma rota chama o Ollama diretamente: tudo passa pela `FilaLLM`.
13. **Segurança:** o Farol é auxílio, nunca a única fonte de segurança. Não escreva texto que sugira substituir bengala/cão-guia.

---

## 4. Inventário: o que existe e o que falta

### 4.1 Já existe (em `_referencia/`) → destino

Os arquivos de referência vieram exportados em `.md`: **remova as cercas de código** (```` ```python ````, ```` ```yaml ````, ```` ```markdown ````) e **crases soltas** no início/fim (`identificar_risco.py` e `vocabulario.py` começam e terminam com uma crase). Sem isso o `carregar()` dos `SKILL.md` falha (o regex exige `---` na primeira linha) e o Python não compila.

| Referência | Destino | Situação |
|---|---|---|
| `farol.yaml.md` | `config/farol.yaml` | Corrigir typo + novas chaves (5.2) |
| `SKILL descrever-ambiente.md` | `skills/descrever-ambiente/SKILL.md` | Corrigir modelo (5.3) |
| `SKILL responder-perguntas.md` | `skills/responder-pergunta/SKILL.md` | **Pasta no singular**, igual ao `name:`; corrigir modelo (5.3) |
| `skill.py.md` | `src/farol/skills.py` | **Renomear para `skills.py`** (a doc e o `FilaLLM` importam `skills`); lógica ok |
| `identificar_mudanca.py.md` | `src/farol/mudanca/identificar_mudanca.py` | Ajustes cirúrgicos (5.4) |
| `identificar_risco.py.md` | `src/farol/risco/identificar_risco.py` | **Refatoração obrigatória** (5.5) |
| `trigger.py.md` | `src/farol/risco/trigger.py` | Pequenas adições (5.5) |
| `roteador.py.md` | `src/farol/pergunta/roteador.py` | Corrigir casamento de palavras (5.6) |
| `fluxo_simples.py.md` | `src/farol/pergunta/fluxo_simples.py` | Corrigir casamento + templates (5.6) |
| `vocabulario.py.md` | `src/farol/pergunta/vocabulario.py` | Ampliar + corrigir TTS (5.6) |
| `requirements.txt.md` | `requirements.txt` | Completar (5.1) |
| `passo a passo venv.md` | `docs/setup.md` | Mantido (PowerShell/Windows) |

### 4.2 Falta criar

| Arquivo | Papel (ver doc) |
|---|---|
| `src/farol/contratos.py` | Dataclasses/enums: `Deteccao`, `ObjetoTratado`, `MensagemSaida`, `Prioridade`, `Motivo`, `Origem` (doc 6) |
| `src/farol/sessao.py` | `EstadoSessao` (frozen), `EstadoRisco`, `Sessao` (doc 6.4) |
| `src/farol/captura.py` | `SlotFrame` + `ingerir_frame(bytes)` (decodifica JPEG e publica no slot) + captura em thread **apenas para desenvolvimento** (webcam ou arquivo de vídeo) (doc 7.1) |
| `src/farol/deteccao.py` | `DetectorCoco` (YOLO26n + `track`), `DetectorDegraus` (modelo próprio, classe `degrau`) e `Percepcao`, todos → `list[Deteccao]` (doc 7.2 + `farol-risco-degraus.md` 5.1) |
| `src/farol/filtro.py` | Filtro normal + linguagem espacial + recorte (doc 7.3) |
| `src/farol/contexto.py` | Variáveis que cada `SKILL.md` espera (doc 5.5) |
| `src/farol/fila_llm.py` | Worker único, prioridade, cancelamento (doc 5.4) |
| `src/farol/fila_saida.py` | Fila de prioridade com TTL (doc 7.7c) |
| `src/farol/mensagens.py` | **Arquivo novo fora da doc** (junto com `estabilizador.py` e os dois routers). Construtores de `MensagemSaida` (`msg_risco`, `msg_ambiente`, `msg_resposta`, `msg_erro`, `msg_silencio`) + `sequencia` + `normalizar_para_tts` |
| `src/farol/mudanca/estabilizador.py` | **Novo (ver 5.4).** Persistência `frames_para_entrar/sair` e histerese de região |
| `src/farol/api/servidor.py` | `criar_app(deps)`: monta o FastAPI, inclui os dois routers e expõe `WS /ws` de saída (doc 7.9) |
| `src/farol/api/rota_frames.py` | **Novo.** Router só de entrada de imagem (bytes) → YOLO |
| `src/farol/api/rota_perguntas.py` | **Novo.** Router só de perguntas → roteador → Caminho 1 ou Gemma |
| `src/farol/main.py` | Orquestra threads e ciclo (doc 3.2 e 8) |
| `src/farol/ocr.py` | **Opcional, atrás de flag** (ver 6.12) |
| `__init__.py` | Em `src/`, `src/farol/` e subpacotes |
| `tests/…`, `scripts/medir_yolo.py` | Testes (seção 8) e medição da Fase 1 |

**Convenção de import:** o código existente usa `from src.farol.pergunta.vocabulario import VOCAB`. Mantenha `src.farol.*` em todo o projeto e execute da raiz: `python -m src.farol.main`. Não misture com imports relativos nem com `farol.*`.

---

## 5. Divergências e correções obrigatórias

### 5.1 Gerais

- **Typo de modelo:** `gemma3b:4b` não existe. O correto é **`gemma3:4b`**, e ele é o **único modelo do projeto**: `farol.yaml` → `llm.modelo_risco`, os dois `SKILL.md` e a verificação opcional de risco. A doc técnica (`docs/farol-documento-tecnico.md`) já está padronizada com `gemma3:4b`. Não escreva nenhum outro nome de modelo no código, nos testes ou no YAML; se encontrar `qwen`, `llava` ou outro em qualquer arquivo, corrija para `gemma3:4b` e registre em `docs/decisoes.md`.
- **Trocar de modelo no futuro = editar só o `model:` do frontmatter do `SKILL.md`** (e `llm.modelo_risco`). Não espalhe nome de modelo pelo código.
- **`requirements.txt` incompleto.** O atual não tem WebSocket nem testes. Deve ficar:
  ```
  ultralytics
  opencv-python
  ollama
  PyYAML
  fastapi
  uvicorn[standard]
  pytesseract
  numpy
  pytest
  httpx
  ```
  `uvicorn` puro **não serve WebSocket**; `[standard]` é necessário. `httpx` é exigido pelo `TestClient` do FastAPI.
- **Tesseract (OCR)** é binário do sistema, não pacote pip. Documente em `docs/setup.md` a instalação no Windows e o idioma `por`.
- **Carregador de YAML:** crie `src/farol/config.py`? **Não.** Leia o YAML uma vez no `main.py` com `yaml.safe_load` e injete os dicionários (`cfg["mudanca"]`, `cfg["risco"]`…) nas funções, como o código existente já espera (`cfg_mudanca: dict`).

### 5.2 `config/farol.yaml`

Mantenha todos os valores e comentários do autor. Aplique:

- `llm.modelo_risco: gemma3:4b` (corrige typo).
- Adicione chaves **novas e opcionais** (o código deve ter default igual ao mostrado, para o YAML antigo continuar funcionando):

```yaml
risco:
  area_min_alerta: 0.0          # ignora riscos menores que isso (calibrar na Fase 9; ex.: carro muito longe)
  classes_criticas: [degrau]    # classe do modelo de degraus; vazio = ramo inerte
  area_aviso: 0.10              # só para classes_criticas (calibrar)
  area_atencao: 0.25            # só para classes_criticas (calibrar)
yolo_degraus:                   # bloco completo na seção 4 de docs/farol-risco-degraus.md
  habilitado: true
  modelo: models/degraus.pt
  classes: [degrau]
mensagens:
  expira_ms_risco: 3000
llm:
  jpeg_qualidade: 80
  jpeg_max_lado: 640            # reduz a imagem antes de enviar ao VLM (latência)
ocr:
  habilitado: false
  idioma: por
api:
  frame_max_bytes: 2000000   # rejeita frame maior que isso
  timeout_frames_s: 3          # sem frame por mais tempo que isso -> mensagem ERRO falada
pergunta:
  sempre_llm: false            # true = toda pergunta vai ao Gemma (ignora o Caminho 1)
```

### 5.3 Skills e `skills.py`

- A lógica de `carregar()`/`executar()` está **correta e idêntica à doc (5.3)**: não reescreva. Só renomeie o arquivo e remova as cercas.
- Nos dois `SKILL.md`: `model: gemma3:4b`. Mantenha `version: 1`, `temperature` e `num_predict` do autor.
- Em `descrever-ambiente`, alinhe a regra "lista vazia" com a doc: *"diga que não identificou objetos relevantes"*.
- **Teste obrigatório:** `carregar("skills")` precisa passar com os dois arquivos reais (garante que as cercas foram removidas e que `name` == nome da pasta).
- O frontmatter tem comentários `# ...` inline: o `yaml.safe_load` aceita; um teste deve garantir.
- **Regras de `[risco]` nos dois `SKILL.md`:** acrescente ao `## Sistema` o texto exato da seção 5.7 de `docs/farol-risco-degraus.md` (descrever-ambiente: mencionar escada em destaque, `[risco, já avisado]` sem repetir "atenção", nunca dar degraus nem tamanho; responder-pergunta: caixa única cobre a escada, contar só degraus nítidos, tamanho só qualitativo). Prompt continua só nos `.md`.

### 5.4 `identificar_mudanca.py` (manter assinatura)

Assinatura a **preservar**: `identificar_mudanca(objetos_atuais: tuple, estado_sessao, cfg_mudanca: dict, agora: float) -> DecisaoMudanca`. A pseudo-chamada da doc (seção 8) omite `cfg_mudanca` e `agora`: **vale o código**.

Lacunas a corrigir, sem reescrever a função:

1. **Campos que não existem no estado.** O código lê `ultimo_ts_fala` e `ultimo_json` via `getattr/hasattr`. Adicione ao `EstadoSessao` (com default): `ultimo_ts_fala: float | None = None`, `contexto_invalido: bool = False`, `ultimo_frame: object | None = None`. Pode trocar `getattr/hasattr` por acesso direto.
2. **Contexto invalidado por risco** (doc 7.7): logo após a checagem de `descricao_inicial_feita`, se `estado_sessao.contexto_invalido` → devolver `DecisaoMudanca(deve_falar=True, motivo="MUDANCA_DRASTICA", prioridade=3, drastica=True)`.
3. **Motivos fora do enum.** O código devolve `"MUDANCA_CENA"`, que não está em `Motivo`. Adicione `MUDANCA_CENA` ao enum (e `OBJETO_SAIU` já existe: use-o quando só houver `SAIU`). `DecisaoMudanca.motivo` é `str`; converta para `Motivo(...)` na hora de montar a `MensagemSaida`.
4. **Default de cooldown inconsistente:** o código usa `6` como fallback e o YAML `4`. Use o fallback `4`.
5. **Ruído por oscilação.** A chave do `Counter` é `(classe_yolo, classe_pt, horizontal, distancia)`: um objeto na fronteira entre "perto" e "a média distância" gera `ENTROU`+`SAIU` falsos a cada frame. As chaves `frames_para_entrar` e `frames_para_sair` do YAML **hoje não são usadas por ninguém**. Resolva **antes** de chamar `identificar_mudanca`, em `mudanca/estabilizador.py`:
   - Classe `Estabilizador` (estado mutável, **pertence só à `T_percepcao`**, sem lock).
   - `atualizar(tratados, cfg) -> tuple[ObjetoTratado, ...]` devolve apenas os objetos **estáveis**:
     - um `id_track` só entra no conjunto estável após `frames_para_entrar` frames consecutivos;
     - só sai após `frames_para_sair` frames consecutivos ausente;
     - **histerese de rótulo:** `horizontal` e `distancia` de um track só mudam após `frames_para_entrar` frames seguidos no novo rótulo.
   - Detecções COCO com `id_track is None` **não** entram na descrição (o tracker ainda não as estabilizou); registre a contagem no log. O risco as trata separadamente. **Exceção:** `origem == "degraus"` não tem tracker e usa chave sintética `degrau:{horizontal}` (`docs/farol-risco-degraus.md` 5.5).
   - Passe o resultado como `objetos_atuais` e grave-o em `sessao.ultimo_json` ao fim do ciclo.
6. `MOVEU` (doc 7.5) **não** está implementado no código existente: deixe no backlog, não implemente agora.
7. **Objetos de risco não participam da mudança.** No início de `identificar_mudanca`, descarte `o.risco` **dos dois lados** (`objetos_atuais` e `ultimo_json`) e calcule contadores, fração drástica e eventos só com o restante. A entrada do degrau é avisada pelo risco (template); a saída não é comunicada (`docs/farol-risco-degraus.md` 5.6).

### 5.5 `identificar_risco.py` e `trigger.py`

**O `identificar_risco.py` atual é um protótipo que viola a arquitetura:** roda o YOLO uma segunda vez (`modelo_yolo(frame)`), ignora `risco.classes` e `risco.conf_min` do YAML, só alerta com a caixa ocupando >25% do frame, devolve no primeiro achado e trata só `stairs/step/puddle/hole` (classes que **não existem no COCO**; o degrau real vem do modelo próprio, classe `degrau`). Refatore para uma **função pura sobre `list[Deteccao]`** (JSON bruto), sem `cv2`/`ultralytics`:

```python
@dataclass(frozen=True)
class RiscoDetectado:
    chave: int | str        # id_track; sem tracker: f"{classe_yolo}:{horizontal}"
    classe_yolo: str
    classe_pt: str
    nivel: str              # "ATENCAO" | "AVISO"
    area_rel: float
    horizontal: str
    distancia: str
    mensagem: str           # texto do alerta por template (sem LLM)

def identificar_risco(bruto: Sequence[Deteccao], cfg_risco: dict) -> list[RiscoDetectado]: ...
```

Regras:
- Considera só `classe in cfg_risco["classes"]` **e** `conf >= cfg_risco["conf_min"]` **e** `area_rel >= area_min_alerta` (default `0.0`).
- **Alerta no primeiro avistamento, qualquer tamanho** (doc 7.8: "prefira falso positivo a falso negativo"). A decisão de repetir é do `trigger`. Isso substitui o limiar fixo de 25% do protótipo; o autor calibra com `area_min_alerta` na Fase 9.
- `nivel`: `ATENCAO` se `distancia in ("muito perto", "perto")`, senão `AVISO`.
- **Classes críticas (Fase B):** preserve a ideia de gradação do protótipo, agora guiada por YAML: para classes em `risco.classes_criticas`, `area_rel > area_atencao` → `ATENCAO`, `> area_aviso` → `AVISO`, abaixo disso ignora. Com a lista vazia, esse ramo fica inerte. **O degrau já está treinado:** com `classes_criticas: [degrau]`, o ramo age sobre as detecções `origem="degraus"` (classe única `degrau`, falada como "escada"; sem distinguir subida/descida). Detalhes em `docs/farol-risco-degraus.md` (5.3).
- Templates (sem artigo, para não errar gênero): `ATENCAO` → `"Atenção! {classe_pt} {horizontal}, {distancia}."`; `AVISO` → `"Aviso: {classe_pt} {horizontal}, {distancia}."`
- Retorna **todos** os riscos do frame, ordenados por `nivel` (ATENCAO primeiro) e `area_rel` desc.
- `classe_pt` vem de `CLASSES_PT` (seção 5.6). Reaproveite as funções `horizontal()`/`distancia()` de `filtro.py`.
- Descarte `limiar_aviso/limiar_atencao/limiar_colisao` como parâmetros posicionais; registre a mudança em `docs/decisoes.md`.

`trigger.py` (a lógica de `deve_alertar` está correta; mantenha a assinatura):
- `RiscoAlertado` vive aqui; `sessao.py` importa dele.
- Aceite chave `int | str`.
- **Adicione** `registrar_alerta(estado_risco, chave, area, agora)`, que grava `RiscoAlertado(ultima_area=area, ultimo_ts=agora)`. O ciclo chama **no instante do alerta**, não no fim do ciclo (senão o mesmo perigo é alertado em loop enquanto o LLM trabalha: motivo da separação em doc 6.4).
- **Adicione** `limpar_antigos(estado_risco, agora, max_idade_s)` para o dict não crescer; chame periodicamente.
- `deve_alertar` recebe `fator_aproximacao` e `repetir_apos_s` como parâmetros: o ciclo os extrai de `cfg["risco"]`.

### 5.6 Pergunta (roteador, Caminho 1, vocabulário)

O fluxo e a classificação estão certos, mas há **bugs de casamento de texto** que mandam perguntas para o caminho errado:

1. **Substring em vez de palavra.** `"cor" in pergunta_norm` casa "corredor", "incorreto"; `"ha"` casa "chave", "hamburguer"; `"tem"` casa "item"; `"mesa"` casa "mesas" (ok) mas `"ha"` é o pior. Crie em `fluxo_simples.py`, ao lado de `normalizar`, `tem_palavra(texto_norm, termos) -> bool` com `re.search(rf"\b{re.escape(t)}\b", ...)` (e `\bquant\w*` para contagem), e use-a em `classificar_intencao` e em `processar_caminho1` (o `roteador` já importa de `fluxo_simples`). **Mantenha a ordem de prioridade atual:** ATRIBUTO > CONTAR > EXISTE > LOCALIZAR > GERAL.
2. **Plural.** Com palavra inteira, "cadeiras" deixaria de casar. O casamento de termos do `VOCAB` deve aceitar singular e plural (`s`, `es`, e `-ao` → `-oes`: televisão/televisões), via função única `achar_termo(pergunta_norm) -> (termo_pt, classe_en) | (None, None)` usada pelo roteador **e** pelo Caminho 1 (hoje a busca está duplicada).
3. **Duplicação de intenção.** `processar_caminho1` reclassifica a intenção por conta própria. Mude para `processar_caminho1(pergunta, objetos_tratados, intencao=None, termo_pt=None, classe_en=None)`: se vierem `None`, calcula localmente (comportamento atual preservado); o roteador passa o que já calculou. Cuidado com import circular: `fluxo_simples` **não** pode importar `roteador`.
4. **Templates com gramática.** `"O/A {termo}"` e `f"{termo}s"` ("televisaos") não podem ir à voz. Em `vocabulario.py` adicione `ARTIGO` (`"a"`/`"o"` por termo, default `"o"`), `TERMO_EXIBICAO` (`sofa→sofá`, `televisao→televisão`, `alguem→alguém`) e `pluralizar(termo)`. Resultado esperado: `"A mochila está à esquerda, perto."`, `"Há 2 cadeiras."`, `"Sim, há uma pessoa à frente, perto."`
5. **Vários matches em LOCALIZAR:** se `len(matches) > 1`, diga a quantidade e a posição do mais relevante ("Há 2 cadeiras; a mais próxima está à esquerda, perto.").
6. **Mantenha** o "Aguarde a primeira descrição do ambiente." e a mensagem honesta de "Não detectei … agora. Tente girar a câmera."
7. **`CLASSES_PT`:** em `vocabulario.py` crie o mapa **completo das 80 classes COCO → PT-BR** (`"knife": "faca"`, `"car": "carro"`…). `VOCAB` é só PT→EN com sinônimos e **não cobre** as classes que o filtro e o risco precisam nomear. Fallback: o próprio nome em inglês.
8. **`normalizar_para_tts`:** `r"à frente" → "bem à sua frente"` vira "bem bem à sua frente" se o texto já tiver "bem à frente". Use lookbehind `(?<!bem )`. Teste de **idempotência**: `f(f(x)) == f(x)`. Aplique-a **uma vez**, em `mensagens.py`, sobre o texto final de qualquer origem (template, VLM, erro).
9. **Escada/degrau** (`docs/farol-risco-degraus.md` 5.8): `VOCAB` ganha `"escada": "degrau"` e `"degrau": "degrau"` (+ `ARTIGO`); o Caminho 1 funciona sobre a base unificada sem outra mudança. **Force Caminho 2** quando a pergunta for de contagem com o termo `degrau` ("quantos degraus?") e inclua em `ATRIBUTO` os termos `tamanho`, `altura`, `alta`, `alto`, `largura`, `comprimento`, `grande`, `pequena`. "Quantas escadas?" continua no Caminho 1 (conta caixas).

### 5.7 Contratos e estado (acréscimos ao que a doc define)

- `ObjetoTratado`: adicione `bbox: tuple[float, float, float, float] | None = None` e `frame_id: int | None = None` (**no fim**, com default: é `frozen` e o código existente só acessa `classe_yolo`, `classe_pt`, `horizontal`, `distancia`). O `bbox` é necessário para o recorte do Caminho 2, que a doc exige (~15% de margem) mas o contrato original não permitia.
- `Deteccao` ganha `origem: str = "coco"` e `ObjetoTratado` ganha `origem: str = "coco"` e `risco: bool = False` (sempre no fim, com default). O degrau é o único objeto com `risco=True` e `classe_pt` vinda de `yolo_degraus.nomes_pt` ("escada").
- `EstadoSessao`: campos novos `ultimo_ts_fala`, `contexto_invalido`, `ultimo_frame` (seção 5.4). `ultimo_frame` guarda o frame **do mesmo ciclo** de `ultimo_json`, para o recorte e para a imagem do VLM nas perguntas.
- Dois espaços de prioridade, **não misture**:
  - `Prioridade` (saída/fala): `CRITICA=1`, `RESPOSTA=2`, `INFORMATIVA=3`.
  - Prioridade da `FilaLLM`: `0` = verificação opcional de risco com `gemma3:4b` (fora das skills), `1` = pergunta, `2` = ambiente.

---

## 6. Especificação dos módulos a criar

Siga os trechos de código da doc (seções 5.3, 5.4, 6, 7). Abaixo, só o que a doc deixa em aberto ou o que muda.

### 6.1 `contratos.py`
Dataclasses/enums da doc 6.1–6.3. `MensagemSaida` com os campos do JSON da doc, `to_dict()` que serializa em **camelCase** (`sessionId`, `frameId`, `expiraEmMs`, `deveFalar`…), e `expirada(agora=None) -> bool` (`timestamp + expiraEmMs/1000 < agora`). `eventos` é lista de dicts (`tipo`, `classe`, `regiao`, `distancia`).

### 6.2 `sessao.py`
Exatamente como a doc 6.4, com os campos extras da 5.7. `EstadoRisco.alertados: dict[int | str, RiscoAlertado]`.

### 6.3 `captura.py`
O app mobile é a câmera: em produção os frames chegam **como bytes pela rota de frames** (6.10), não por `cv2.VideoCapture`.
- `SlotFrame` da doc 7.1 (slot único, sobrescreve).
- `ingerir_frame(slot, dados: bytes, max_bytes) -> bool`: valida tamanho, decodifica com `cv2.imdecode(np.frombuffer(dados, np.uint8), cv2.IMREAD_COLOR)`, publica no slot. Bytes inválidos ou corrompidos → devolve `False`, **não levanta exceção** e incrementa um contador de frames inválidos (log). É a **única** função que escreve no slot em produção.
- `capturar(fonte, slot, parar)`: **só para desenvolvimento e testes.** `fonte` é índice de webcam (`int`) **ou caminho de vídeo** (`str`), para reproduzir `gravacoes/`. Em vídeo, respeite o FPS original e faça loop opcional. Falha ao abrir/ler → exceção tratada pelo `main` (vira `ERRO`).
- Watchdog: se o slot ficar sem frame novo por mais de `api.timeout_frames_s`, o `main` publica **uma** `msg_erro` ("Não estou recebendo imagem da câmera.") e só volta a avisar após o fluxo retomar e cair de novo.

### 6.4 `deteccao.py`
Implemente **`DetectorCoco`, `DetectorDegraus` e `Percepcao`** exatamente como em `docs/farol-risco-degraus.md` (5.1). **Modelo e `conf` vêm do YAML** (`yolo.*` e `yolo_degraus.*`); carregue cada modelo uma vez, nunca por chamada. `Deteccao` ganha `origem: str = "coco"` (no fim, com default). Só o COCO usa tracker. Se `yolo_degraus.habilitado` for `true` e o modelo não carregar, publique `msg_erro` falada e siga só com COCO. Sem `jpeg`/mudança de cor aqui.

### 6.5 `filtro.py`
- `horizontal`, `vertical`, `distancia` da doc 7.3 (limiares de `distancia` ainda como constantes nomeadas no topo do arquivo; calibrar na Fase 2).
- `filtro_normal(bruto, cfg_filtro) -> tuple[ObjetoTratado, ...]`: **só processa `origem == "coco"`** (o degrau entra pela `montar_base`, que forma a **base unificada**; ver `docs/farol-risco-degraus.md` 5.2), com `conf >= conf_min`, `area_rel >= area_min`, ordenado por relevância (área e proximidade do centro), limitado a `max_objetos`; preenche `classe_pt` (via `CLASSES_PT`), `bbox`, `frame_id`.
- `recortar(frame, bbox, margem=0.15)`: recorte com margem, limitado às bordas da imagem.
- `jpeg(frame, qualidade, max_lado) -> bytes` via `cv2.imencode`, reduzindo o maior lado antes. (Pode ficar em `contexto.py` se preferir; escolha um lugar só.)

### 6.6 `contexto.py`
`texto_objetos(tratados, alertados)`, `texto_eventos`, `vars_ambiente` da doc 5.5. `texto_objetos` marca objetos de risco com `[risco]` e, se a chave `classe_yolo:horizontal` estiver em `estado_risco.alertados`, `[risco, já avisado]`. `texto_eventos` nunca contém objeto de risco. **Toda variável do template escolhido tem de ser passada** (falta → `KeyError`): para o modo padrão, `{"objetos": ...}`; para `atualizacao`, `objetos`, `descricao_anterior`, `eventos`. Adicione `vars_pergunta(pergunta, tratados, texto_ocr=None) -> {"pergunta", "contexto"}`.

### 6.7 `fila_llm.py`
Copie a doc 5.4 e acrescente:
- `Tarefa.valida: Callable[[], bool] | None`: no `loop`, antes de `executar`, se `valida` existir e devolver `False` → **descarta** (tarefa de ambiente envelhecida na fila, doc 5.4).
- `ocupada_com(prioridade) -> bool`: há tarefa dessa prioridade na heap **ou** em execução. O ciclo usa para **não enfileirar descrição repetida** enquanto uma está pendente.
- Envolva `ao_concluir`/`ao_erro` em `try/except` com log: um callback que quebra não pode derrubar a thread `T_vlm`.
- **Log por execução:** skill, `version`, modo, duração, cancelada ou não.

### 6.8 `fila_saida.py`
Doc 7.7c, mais: `publicar` de mensagem com `interrompe=True` **limpa as `INFORMATIVA` pendentes** antes de inserir; `proxima()` descarta expiradas (e conta quantas, para métrica).

### 6.9 `mensagens.py`
- `sequencia` monotônica por sessão (um contador protegido por lock, atribuído na publicação).
- `msg_risco(r, frame_id)` → `CRITICA`, `interrompe=True`, `origem=SOMENTE_YOLO`, `motivo=RISCO`, `expiraEmMs = expira_ms_risco`.
- `msg_ambiente(texto, decisao, frame_id)` → `INFORMATIVA`, `origem=VLM`, `expira_ms_informativa`.
- `msg_resposta(texto, origem, frame_id)` → `RESPOSTA`, `RESPOSTA_PERGUNTA`, `expira_ms_resposta`; `origem=SOMENTE_YOLO` no Caminho 1, `VLM` no 2.
- `msg_erro(exc)` → falada, `origem=ERRO`, texto claro em pt-BR ("Não consegui acessar o modelo de descrição.", "A câmera parou de responder."); detalhe técnico só no log.
- `msg_silencio(frame_id)` → `deveFalar=False`. **Faça throttle** (no máximo ~1 por segundo): publicar um por frame inunda o WebSocket sem benefício.
- `normalizar_para_tts` aplicado no campo `mensagem` de **todas** as mensagens faladas.

### 6.10 API: três rotas, cada uma com uma responsabilidade

| Rota | Sentido | Quem usa | Toca no Gemma? |
|---|---|---|---|
| `WS /ws/frames` | app → backend (bytes) | Câmera do app, contínuo | **Não**, nem indiretamente: só alimenta o slot |
| `POST /pergunta` | app → backend (texto) | Opcional, sob demanda do usuário | **Sim**, via `FilaLLM` (Caminho 2) |
| `WS /ws` | backend → app (JSON) | Mensagens faladas (risco, ambiente, resposta, erro) | Não |

`servidor.py`: `criar_app(deps)` recebe um `dataclass` `Deps` (`slot`, `sessao`, `fila_llm`, `fila_saida`, `skills`, `cfg`, `parar`) e inclui os routers. Os routers **não importam um do outro** e só recebem `Deps`.

**`rota_frames.py` (exclusiva do YOLO):**
- `WS /ws/frames`: cada mensagem **binária** é um JPEG; chame `captura.ingerir_frame(...)`. Sem resposta por frame (evita tráfego). Mensagem de texto é ignorada com log.
- Frame inválido ou grande demais: descarta e segue; **não derruba a conexão** nem publica `ERRO` por frame (o watchdog cobre a falta de imagem).
- Opcional e fino: `POST /frame` (corpo = JPEG, `202`) chamando a mesma `ingerir_frame`, para clientes que não usem WebSocket.
- **Proibido** nesta rota: importar `skills`, `fila_llm` ou `ollama`. Teste automático garante isso (ver seção 8).

**`rota_perguntas.py` (somente perguntas):**
- `POST /pergunta {"texto": "..."}`: texto vazio → `422`; senão responde `202 {"status": "recebida"}` e a resposta sai **pelo `/ws`** (não no corpo). Se o texto começar com "farol" (qualquer caixa, vírgula opcional), remova o prefixo.
- Fluxo: `rotear_pergunta(texto, estado.ultimo_json, estado)`:
  - **Caminho 1:** publica a resposta direta (`origem=SOMENTE_YOLO`, sem LLM).
  - **Caminho 2 (aciona o Gemma):** localiza o objeto (`classe_alvo_en`) em `ultimo_json`, recorta `ultimo_frame` por `bbox` (margem 15%; `yolo_degraus.margem_recorte`, 25%, quando o alvo é `degrau`); sem objeto localizável, usa o frame inteiro; enfileira `responder-pergunta` na `FilaLLM` com prioridade `1`, `ao_concluir=publicar_resposta`, `ao_erro=publicar_erro`.
  - Com `pergunta.sempre_llm: true`, o roteador devolve sempre Caminho 2 (exceto a proteção "Aguarde a primeira descrição do ambiente.", que continua valendo).
- Sem frame ainda recebido (`ultimo_frame is None`): resposta falada "Ainda não recebi imagem da câmera." (nunca silêncio, nunca exceção).
- A pergunta é **opcional**: o fluxo contínuo (frames → YOLO → regras) nunca depende dela.

**`WS /ws` (saída), em `servidor.py`:**
- **Ponte thread → asyncio:** `T_saida` é thread comum e o WebSocket é assíncrono. Entregue com `asyncio.run_coroutine_threadsafe(ws.send_json(...), loop)`, guardando o `loop` no evento de startup e o conjunto de conexões ativas. Cliente que cai é removido sem derrubar a thread.
- Sessão única no MVP (`sessionId` fixo ou vindo do query param de `/ws`).

### 6.11 `main.py`
- Argumentos: `--fonte` (`api` por padrão; ou índice de webcam; ou caminho de vídeo, só para desenvolvimento), `--config`, `--sem-api` (imprime as mensagens no console; exige `--fonte` webcam/vídeo; usado na Fase 4).
- Cria threads: `T_percepcao`, `T_vlm` (`fila_llm.loop`), `T_saida`, e `T_captura` **somente** se `--fonte` não for `api`; com `--fonte api` o slot é alimentado pela rota `/ws/frames`. API via `uvicorn` na thread principal. Encerramento limpo (`Event` de parar).
- **Ciclo da `T_percepcao`:** siga a doc 8, com estas correções:
  1. Risco primeiro, com o JSON **bruto**. Para cada `RiscoDetectado` em que `deve_alertar(...)`: `registrar_alerta(...)`, `fila_llm.cancelar_tudo()`, publicar `msg_risco`, `sessao.atualizar(contexto_invalido=True)`.
  2. `estaveis = estabilizador.atualizar(montar_base(bruto, cfg["filtro"], cfg.get("yolo_degraus", {})))`: **base unificada** (COCO + degrau com `risco=True`). O risco do passo 1 já usou o `bruto`.
  3. `decisao = identificar_mudanca(estaveis, estado, cfg["mudanca"], agora)`.
  4. Se `deve_falar` **e** `not fila_llm.ocupada_com(2)`: reserve o cooldown **no momento de enfileirar** (`sessao.atualizar(ultimo_ts_fala=agora)`), senão o mesmo evento é detectado de novo nos frames seguintes enquanto o LLM trabalha. Modo `""` se `decisao.drastica`, senão `"atualizacao"`. Passe `valida=` que expira a tarefa após `expira_ms_informativa`.
  5. `ao_concluir` de ambiente: publica `msg_ambiente` e então `sessao.atualizar(ultima_descricao=texto, descricao_inicial_feita=True, contexto_invalido=False)`. **`descricao_inicial_feita` só vira `True` quando a primeira descrição foi gerada**, não ao enfileirar.
  6. Fim do ciclo: `sessao.atualizar(ultimo_frame_id=..., ultimo_json=estaveis, ultimo_frame=frame)` (atômico, mesmo ciclo).
- Cada ponto que pode falhar (YOLO, câmera, Ollama) captura `Exception` e publica `msg_erro`, sem matar a thread.
- Logue FPS e tempo por etapa (YOLO, filtro, regras) para as métricas da doc 11.

### 6.12 `ocr.py` (opcional, flag `ocr.habilitado`, padrão `false`)
`pytesseract` está no `requirements.txt` e o autor decidiu manter o OCR **separado** do modelo de descrição, mas a doc técnica não o especifica. Implemente só o gancho: `ler_texto(recorte_bgr, idioma="por") -> str`. Quando habilitado e a pergunta for `ATRIBUTO` de leitura ("escrito", "leia", "texto", "rótulo"), rode no recorte e injete no `{{contexto}}` da skill uma linha `Texto lido por OCR: "..."`, **sem alterar o template do `SKILL.md`**. Desabilitado, o texto escrito segue só pelo VLM. Não construa nada além disso.

---

## 7. Ordem de construção (fases da doc, adaptadas ao que já existe)

Cumpra o aceite antes de avançar. Fases 0 e 1 envolvem o ambiente do autor: faça só o que for código.

| Fase | Entrega | Aceite |
|---|---|---|
| **0** | Estrutura de pastas, `__init__.py`, `requirements.txt` corrigido, `docs/setup.md`, arquivos de `_referencia/` movidos e **limpos** (cercas/crases), `farol.yaml` e `SKILL.md` corrigidos | `pip install -r requirements.txt` ok; `python -c "import src.farol.skills"` ok; `skills.carregar("skills")` carrega as duas skills |
| **1** | `scripts/medir_yolo.py`: lê webcam/vídeo, imprime classe, conf, área, FPS, tempo/frame; salva CSV | Roda em um vídeo de `gravacoes/` e gera a tabela (o autor calibra `conf_min`/`area_min` com ela) |
| **2** | `contratos.py`, `filtro.py`, `CLASSES_PT` | Testes com detecções fabricadas: saída bate com "cadeira: à esquerda, perto" |
| **3** | `sessao.py`, `fila_saida.py`, `fila_llm.py`, `skills.py` testados com `chat` falso | Risco fictício corta descrição fictícia; mensagem expirada é descartada; pergunta passa na frente de ambiente; skill inválida falha com erro claro; modo inexistente e variável faltando dão `KeyError` |
| **4** | `contexto.py`, `mensagens.py`, ciclo mínimo no `main.py --sem-api` com Ollama real, **sem** mudança/risco ainda (só descrição inicial) | Console mostra a descrição de uma cena gravada; log de latência por `version` |
| **5** | `api/servidor.py`, `rota_frames.py`, `rota_perguntas.py` (a de perguntas ainda com o roteador simples) | Cliente de teste envia JPEGs por `/ws/frames` e recebe mensagens por `/ws` com todos os campos do contrato e `sequencia` crescente; bytes inválidos não derrubam a conexão |
| **6** | Integração de `roteador`/`fluxo_simples`/`vocabulario` com os ajustes da 5.6 e Caminho 2 com recorte | ~30 perguntas de teste classificadas certo; localizar/contar/existe **não** chamam o LLM |
| **7** | `estabilizador.py` + `identificar_mudanca` integrado, cooldown, mudança drástica, `contexto_invalido` | Em vídeo com pessoa entrando e saindo: fala na entrada, não repete; oscilação do YOLO não gera fala |
| **8** | `identificar_risco` refatorado (COCO **e** degrau), `trigger`, interrupção ponta a ponta; cumpra também as fases D1 a D4 (incluindo D3b, base unificada, após as Fases 6 e 7) de `docs/farol-risco-degraus.md` (medição dos dois modelos incluída) | Faca/veículo/degrau geram alerta; o mesmo risco não repete sem aproximação nem passar `repetir_apos_s`; alerta cancela fala em andamento |
| **9** | Tratamento de erros (câmera cai, Ollama fora → `ERRO` falado), métricas, `ocr.py` opcional | Derrubar o Ollama durante a execução gera mensagem `ERRO` audível, nunca silêncio |

Testar na Fase 3, contra o Ollama real, **se interromper a leitura do stream faz o modelo parar de gerar** (doc 7.7). Documente o resultado em `docs/decisoes.md`.

---

## 8. Testes (pytest, sem GPU e sem Ollama)

- `tests/test_skills.py`: frontmatter ausente, `name` ≠ pasta, variável em `## Sistema`, modo inexistente, variável faltando, render nos dois modos de `descrever-ambiente`, carga dos `SKILL.md` reais.
- `tests/test_fila_llm.py`: prioridade, cancelamento, `cancelar_tudo`, `valida=False` descarta, `ocupada_com`; use `chat` falso (texto fixo ou dormindo).
- `tests/test_fila_saida.py`: TTL, prioridade, `interrompe` limpa informativas.
- `tests/test_filtro.py`: grid horizontal/vertical, distância, filtro, recorte nas bordas.
- `tests/test_estabilizador.py`: entrada após N frames, saída após M, histerese de rótulo, `id_track=None` ignorado.
- `tests/test_identificar_mudanca.py`: descrição inicial, sem mudança, entrada, saída, drástica (≥70%), cooldown, `contexto_invalido`.
- Testes de degrau: **todos** os de `docs/farol-risco-degraus.md` (seção 8): `test_detector_degraus`, `test_percepcao`, `test_base_unificada`, `test_contexto`, `test_cenarios_degrau`, `test_main_init` e os acréscimos em `test_estabilizador`, `test_identificar_mudanca` e `test_pergunta`.
- `tests/test_risco.py` e `tests/test_trigger.py`: classe fora da lista, `conf` abaixo, template de texto, ordenação, risco novo, aproximação ×1,3, repetição após `repetir_apos_s`, `registrar_alerta`.
- `tests/test_pergunta.py`: bateria de ~30 frases. Obrigatório incluir: "corredor" **não** vira `ATRIBUTO`; "chave" **não** vira `EXISTE`; plural ("cadeiras") casa; "onde está a mochila" → Caminho 1; "de que cor é a camiseta" → Caminho 2; termo fora do vocabulário ("porta") → Caminho 2; pergunta antes da descrição inicial → "Aguarde…".
- `tests/test_tts.py`: idempotência de `normalizar_para_tts`, "bem à frente" não duplica.
- `tests/test_api.py`: `TestClient` com as três rotas. Casos obrigatórios: JPEG válido em `/ws/frames` chega ao slot; bytes aleatórios e frame acima de `frame_max_bytes` são descartados sem derrubar a conexão; frame enviado **não** cria tarefa na `FilaLLM` (use fila falsa); `/pergunta` Caminho 1 **não** enfileira; Caminho 2 enfileira exatamente uma tarefa `responder-pergunta` com prioridade 1; `sempre_llm: true` força Caminho 2; texto vazio → 422; pergunta sem frame → resposta falada.
- `tests/test_isolamento_rotas.py`: `rota_frames.py` não importa `skills`, `fila_llm` nem `ollama` (inspecione o AST ou `sys.modules` após importar só esse módulo); `rota_perguntas.py` não importa `ollama`.

---

## 9. Como entregar cada fase

Ao terminar uma fase, responda **somente** com:

1. Arquivos criados/alterados (lista curta).
2. Saída do `pytest` (resumo) e como rodar a fase manualmente.
3. Divergências em relação à doc ou a este prompt (e a entrada correspondente em `docs/decisoes.md`).
4. Riscos ou dúvidas para a próxima fase.

Depois **aguarde confirmação** antes de iniciar a seguinte.

---

## 10. Fora do escopo e proibições

- Navegação/rota, reconhecimento facial, uso como substituto de bengala ou cão-guia.
- Novo treino para poça/buraco/desnível (Fase B do risco). O degrau **já está treinado** e entra via `docs/farol-risco-degraus.md`; não retreine nem funda modelos.
- `MOVEU` em `identificar_mudanca` e qualquer otimização por diferença de pixels.
- Nova skill `SKILL.md`, nova camada de abstração de executor, hierarquia de exceções, ORM, banco de dados, frontend. O app/front é cliente à parte.
- Colocar texto de prompt em arquivo `.py`, ou variável `{{...}}` no `## Sistema`.
- Reescrever funções existentes que a seção 5 manda apenas ajustar.
- Chamar o YOLO fora de `deteccao.py` ou o Ollama fora de `skills.py` (exceção: verificação opcional de risco com `gemma3:4b`, que chama `ollama.chat` direto e **não** é skill).
- Inventar métricas ou números de calibração: use os do YAML e registre o que foi medido.

---

## 11. Decisões em aberto (pergunte só se bloquear a fase)

1. **Início do TTL das mensagens.** `timestamp` = instante da captura do frame ou da publicação? Com VLM lento, TTL de 4 s contado desde o frame pode descartar quase toda descrição. Padrão adotado: **captura do frame**, com contador de mensagens expiradas no log para decidir na Fase 4.
2. **Risco no primeiro avistamento, qualquer tamanho** (5.5), em vez do limiar de 25% do protótipo. Padrão adotado: primeiro avistamento, ajustável por `risco.area_min_alerta`.
3. **Descrição do ambiente (`descrever-ambiente`) continua acionando o Gemma pelo ciclo contínuo**, decidida pelas regras (`deve_falar`), não pela rota de frames. Se a intenção era que o fluxo de frames fosse **só YOLO** (descrição por template, sem Gemma) e o Gemma ficasse apenas nas perguntas, avise: muda o ciclo da 6.11 e a skill `descrever-ambiente` sai do MVP.
4. **OCR** (6.12): hoje só gancho desabilitado. Confirmar se entra no MVP.
5. **Sessão única** no MVP; multi-sessão fica para depois.
6. **Degrau (`docs/farol-risco-degraus.md`):** o alerta sai na hora e a descrição cita a escada com `[risco, já avisado]`; o detector de degrau roda a cada `a_cada_n_frames` (só produz saída quando há degrau); o Farol fala "escada" para a classe `degrau`.
