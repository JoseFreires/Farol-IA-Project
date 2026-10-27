# Documentação técnica do backend Farol

**Escopo:** documentação do backend presente no repositório após a simplificação arquitetural. O documento cobre o fluxo HTTP, o processamento de imagem, a seleção e execução de skills, as regras de comunicação, configuração, dependências, testes e os módulos Python existentes.

**Não fazem parte do escopo:** arquivos de ambiente (`.env`), ambientes virtuais, caches e dados locais. Nenhum valor de segredo é documentado.

## 1. Visão macro

O backend oferece uma API FastAPI para receber uma imagem e, opcionalmente, uma pergunta. Um único `Processor` coordena a detecção de repetição visual, o runtime de skills e as regras determinísticas que decidem se há algo a comunicar.

```text
Aplicativo cliente
    │ HTTP + imagem Base64 + sessionId + pergunta opcional
    ▼
app/main.py — autenticação, validação/decodificação e resposta HTTP
    ▼
app/processor.py — fluxo da sessão e coordenação
    ├── core/diff_visual.py — comparação compacta entre frames
    ├── agent_runtime/runtime.py — seleção determinística de uma skill
    │       └── SkillExecutor
    │             ├── SkillRegistry + MarkdownLoader
    │             └── ExecutorRegistry → OllamaSkillExecutor → OllamaClient
    └── rules/rules.py — confiança, cooldown e decisão de fala
    ▼
ProcessingResult → JSON da API
```

O runtime não usa planner nem delegação multiagente. Uma solicitação escolhe uma skill por regras locais e a executa uma vez. O cliente de modelo configurado atualmente é o Ollama; as instruções de cada skill ficam em `backend/skills/<id>/SKILL.md`.

Não há atualmente rota dedicada de OCR, boleto ou `/descrever`: esses componentes legados foram removidos. A leitura da imagem acontece no runtime multimodal das skills.

## 2. Estrutura do backend

| Caminho | Responsabilidade |
|---|---|
| `backend/app/main.py` | Inicialização FastAPI, autenticação, rotas, validação da entrada e tradução de exceções para HTTP. |
| `backend/app/config.py` | Leitura de configurações via Pydantic Settings e ambiente. |
| `backend/app/processor.py` | Contratos de processamento, memória em processo, composição do runtime e fluxo principal. |
| `backend/core/diff_visual.py` | Redução de imagens e comparação pixel a pixel aproximada dos frames. |
| `backend/rules/rules.py` | Modelos de dados da análise, memória, limiares de confiança e política de fala. |
| `backend/agent_runtime/runtime.py` | Seleção da skill, conversão do resultado estruturado em `AnalysisData`. |
| `backend/agent_runtime/markdown_loader.py` | Carregamento, validação e cache das definições Markdown de skills. |
| `backend/agent_runtime/skill_registry.py` | Descoberta e acesso às skills instaladas. |
| `backend/agent_runtime/skill_executor.py` | Orquestra a busca da definição e a execução selecionada. |
| `backend/agent_runtime/executor_registry.py` | Mapeia o nome de executor para a implementação. |
| `backend/agent_runtime/ollama_skill_executor.py` | Cria a requisição multimodal e valida o JSON retornado pelo modelo. |
| `backend/agent_runtime/ollama_client.py` | Comunicação HTTP assíncrona com a API Ollama `/api/chat`. |
| `backend/agent_runtime/models.py` | Tipos imutáveis para definição, resumo, requisição e resultado de skill. |
| `backend/agent_runtime/exceptions.py` | Exceções tipadas do carregamento e da execução. |
| `backend/agent_runtime/__init__.py` | Exportações públicas do pacote `agent_runtime`. |
| `backend/skills/describe-environment/SKILL.md` | Instruções de descrição inicial do ambiente. |
| `backend/skills/locate-object/SKILL.md` | Instruções de localização de objeto solicitado. |
| `backend/skills/identify-change/SKILL.md` | Instruções de identificação semântica de mudanças. |
| `backend/skills/detect-risk/SKILL.md` | Instruções de identificação cautelosa de riscos visíveis. |
| `backend/tests/` | Testes de API, regras, runtime, descoberta das skills e diferença visual. |
| `backend/debug_residencial.py` | Script auxiliar legado de chamada local da API; não integra o runtime da aplicação. |
| `backend/requirements.txt` | Dependências Python com versões fixadas. |

## 3. Inicialização, configuração e execução

`backend/app/config.py` declara `Settings` com `APP_TOKEN` obrigatório. O host Ollama, o modelo e o tempo de permanência têm padrões. O arquivo `.env` é relativo ao diretório de execução e não é versionado neste documento.

| Variável | Obrigatória | Padrão | Uso |
|---|---:|---|---|
| `APP_TOKEN` | Sim | — | Token aceito pela autenticação da API. |
| `OLLAMA_HOST` | Não | `http://localhost:11434` | Endereço base do Ollama. |
| `OLLAMA_MODEL` | Não | `gemma3:4b` | Modelo multimodal configurado. |
| `OLLAMA_KEEP_ALIVE` | Não | `30m` | Tempo de permanência configurado na requisição ao Ollama. |

O `OllamaConfig` também define timeout de 120 segundos, até duas tentativas configuradas, temperatura zero e `keep_alive` padrão de cinco minutos. Na inicialização normal, `_build_runtime()` substitui o padrão de `keep_alive` pelo valor de `OLLAMA_KEEP_ALIVE`. O cliente atual não implementa laço de retry, apesar de `max_retries` existir na configuração.

Com dependências instaladas, execute a partir de `backend`:

```powershell
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
..\.venv\Scripts\python.exe -m pytest -q
```

O import do módulo `app.main` cria a aplicação e instancia o processador. O processador constrói o runtime real, descobre as skills e prepara o cliente Ollama.

## 4. API HTTP

### `GET /health`

Rota simples de disponibilidade que retorna:

```json
{"ok": true}
```

### `POST /processar`

Exige autenticação pelo cabeçalho `Authorization`. O corpo é recebido como objeto JSON sem modelo Pydantic dedicado. Os campos reconhecidos são:

| Campo | Alternativa aceita | Comportamento |
|---|---|---|
| `sessionId` | `session_id` | Identificador de sessão; padrão `default-session`. |
| `imagemBase64` | `imagem_base64` | Imagem obrigatória em Base64; prefixos data URI JPEG/PNG/JPG são removidos. |
| `pergunta` | — | Texto opcional que direciona a seleção da skill. |

O `contexto` não faz parte do contrato: o fluxo visual atual não usa essa informação. Clientes podem omitir o campo; se um cliente antigo ainda o enviar, ele é ignorado.

Exemplo de requisição sem contexto:

```json
{
  "sessionId": "sessao-123",
  "imagemBase64": "<base64 da imagem>",
  "pergunta": "Onde está a mesa?"
}
```

O endpoint decodifica Base64 com validação estrutural e tenta verificar os bytes com Pillow. Atualmente, bytes não vazios que não sejam reconhecidos pelo Pillow são aceitos por `validar_imagem_bytes`; nesse caso o filtro OpenCV não consegue preparar um frame e o fluxo continua para o runtime. A verificação não equivale a uma validação estrita de imagem.

O resultado normal contém:

```json
{
  "sessionId": "sessao-123",
  "status": "ok",
  "deveFalar": true,
  "mensagem": "A mesa foi identificada à direita.",
  "prioridade": "INFORMATIVA",
  "idioma": "pt-BR",
  "fallback": false,
  "motivo": "RESPOSTA_A_PERGUNTA"
}
```

`fallback` continua no formato de resposta por compatibilidade, mas o processador já não cria respostas artificiais nem retorna sucesso quando o runtime falha. O valor emitido no fluxo normal é `false`.

| Situação | HTTP |
|---|---:|
| Processamento concluído ou frame repetido sem pergunta | 200 |
| Imagem ausente, Base64 inválido ou imagem vazia | 400 |
| Falha interna de runtime, análise ou regras | 500 |
| Falha de autenticação | 401 |

As exceções inesperadas são registradas com stack trace no logger da aplicação; a resposta externa do erro de processamento é genérica (`Erro ao processar a solicitação`).

Os contratos internos são dataclasses imutáveis. Em forma reduzida, a requisição carrega bytes já decodificados e a resposta expõe os campos compatíveis com o cliente:

```python
@dataclass(frozen=True, slots=True)
class ProcessingRequest:
    session_id: str
    imagem: bytes
    pergunta: str | None = None


@dataclass(frozen=True, slots=True)
class ProcessingResult:
    session_id: str
    status: str
    deve_falar: bool
    mensagem: str | None
    prioridade: str
```

## 5. Fluxo de processamento

1. `main.processar()` resolve aliases/defaults, decodifica a imagem e cria `ProcessingRequest`.
2. `Processor.processar()` recupera `SessionMemory` e o frame anterior para aquele `session_id`.
3. Se não há pergunta e o frame anterior existe, `houve_mudanca_visual()` compara a imagem recebida. Se não houver mudança acima do limiar, retorna `SEM_MUDANCA_VISUAL` sem chamar o runtime.
4. Caso contrário, prepara a representação reduzida do frame e chama `AgentRuntime.processar()`.
5. O runtime escolhe uma skill de forma determinística e delega a execução.
6. O resultado da skill é convertido para `AnalysisData`.
7. `Rules.avaliar()` decide se há fala, com base na pergunta, confiança, eventos, memória e cooldown.
8. Somente após a análise e as regras concluírem sem exceção, a memória e o frame da sessão são atualizados.
9. A API serializa `ProcessingResult`.

O fluxo sem fallback pode ser representado assim:

```python
memoria = session_manager.obter_memoria(session_id)
frame_anterior = session_manager.obter_frame(session_id)

if not pergunta and frame_anterior and not houve_mudanca_visual(imagem, frame_anterior):
    return resultado_sem_fala("SEM_MUDANCA_VISUAL")

dados = await runtime.processar(solicitacao, memoria)
if dados.erro:
    raise AnalysisError(dados.erro)

decisao = rules.avaliar(dados, memoria, pergunta)
session_manager.atualizar_memoria(session_id, dados, decisao)
session_manager.atualizar_frame(session_id, frame_atual)
return resultado(decisao)
```

O trecho é esquemático: a implementação completa, incluindo tipos e serialização, está em `backend/app/processor.py`.

## 6. Memória e diferença visual

`SessionManager` mantém dicionários em memória do processo:

- `_sessions`: objetos `SessionMemory` indexados por `session_id`;
- `_frames`: frames em escala de cinza e tamanho fixo de 128 × 128.
- `_images`: imagem anterior em JPEG reduzido, limitada a 768 pixels no maior lado e qualidade 80, para comparação semântica.

Não há persistência, expiração ou limite de sessões; reiniciar o servidor limpa o estado e múltiplos workers não compartilham a memória.

`core/diff_visual.py` decodifica a imagem em tons de cinza e reduz para `128 × 128`. Um pixel é considerado alterado quando sua diferença de intensidade é de pelo menos 8% (`LIMIAR_INTENSIDADE_PIXEL`); `calcular_diferenca_visual()` retorna a proporção desses pixels no frame:

```python
diferenca = cv2.absdiff(frame_novo, imagem_anterior)
pixels_alterados = diferenca >= round(LIMIAR_INTENSIDADE_PIXEL * 255)
percentual_mudanca = float(np.mean(pixels_alterados))
```

`LIMIAR_MUDANCA_LOCAL = 0.08` e `LIMIAR_MUDANCA_AMBIENTE = 0.45`. Sem pergunta, abaixo de 8% de pixels alterados o frame é descartado sem runtime; de 8% (inclusivo) até abaixo de 45% força `identify-change`; a partir de 45% (inclusivo), o processador limpa toda a memória espacial e força `describe-environment` com a pergunta e a imagem anterior removidas da solicitação interna. Um primeiro frame não tem variação anterior e segue a seleção inicial normal. Frames inválidos continuam tratados como mudança para não descartar a análise.

O percentual mede a área de pixels com diferença significativa, não a intensidade média nem uma classificação semântica de cômodo. Nas imagens `teste2.jpg`/`teste3.jpg` usadas na investigação, essa métrica resulta em aproximadamente `0.754` (75,4%), acionando o reset espacial.

## 7. Runtime, skills e execução do modelo

### Seleção determinística

`AgentRuntime._selecionar_skill()` escolhe uma única skill:

| Entrada | Skill |
|---|---|
| Sem pergunta e sem descrição inicial na memória | `describe-environment` |
| Sem pergunta e descrição inicial já realizada | `identify-change` |
| Pergunta contendo termos de risco (`risco`, `perigo`, `obstáculo`, `bloqueio`, `seguro`) | `detect-risk` |
| Pergunta contendo termos de mudança (`mudou`, `mudança`, `diferente`, `alteração`) | `identify-change` |
| Outra pergunta | `locate-object` |

A comparação é feita com `casefold()` e busca de substrings; não há classificação por LLM, sinônimos gerais, pontuação de intenção ou configuração de termos.

### Carregamento e validação da skill

`_build_runtime()` aponta o registry para `backend/skills`. `SkillRegistry.discover()` examina somente subdiretórios diretos que contenham `SKILL.md`. `MarkdownLoader`:

- resolve o caminho e exige que esteja sob a raiz permitida;
- aceita Markdown até 64.000 bytes;
- interpreta frontmatter YAML e exige `name`, `description` e instruções;
- exige nome em `kebab-case` e igualdade entre o nome e a pasta;
- permite os executores `ollama` e `python`;
- mantém definições carregadas em cache até `clear_cache()`.

Embora `python` seja aceito no frontmatter, no runtime padrão apenas o executor `ollama` é registrado. Uma skill configurada com executor não registrado falha na execução.

### Contratos estruturados do modelo

O runtime usa modelos Pydantic para validar três famílias de saída:

- descrição/localização: `LocalizarObjetoResultado`, que exige `resposta_semantica`;
- comparação de mudanças: `MudancaResultado`, `MudancaItem` e `ObjetoAlterado`, com campos extras proibidos, confiança no intervalo `[0, 1]` e consistência entre indicador e lista de mudanças;
- risco: `RiscoResultado`.

O objeto unificado que circula entre runtime e regras é `AnalysisData`. Seu contrato também inclui objetos/eventos, confiança e um campo explícito de erro:

```python
from typing import Any


@dataclass(frozen=True, slots=True)
class AnalysisData:
    session_id: str
    descricao: str | None = None
    resposta_semantica: str | None = None
    objetos: tuple[dict[str, Any], ...] = ()
    eventos: tuple[VisualEvent, ...] = ()
    confianca_geral: float | None = None
    metadados: dict[str, Any] | None = None
    erro: str | None = None
```

`OllamaSkillExecutor` envia a imagem em Base64, as instruções da skill e o schema JSON do modelo para `/api/chat`. A resposta é validada com `model_validate_json()`. Erros de chamada ou de schema tornam a execução malsucedida; o runtime transforma o erro em `AnalysisData.erro` e o processador propaga a falha até o endpoint HTTP 500.

O payload de chat tem uma mensagem de sistema com as instruções Markdown, uma mensagem de usuário com os campos JSON e a imagem, além do schema como formato de saída:

```python
payload = {
    "model": config.model,
    "messages": [
        {"role": "system", "content": instrucoes_da_skill},
        {"role": "user", "content": json.dumps(entradas), "images": [imagem_base64]},
    ],
    "format": schema_de_saida,
    "stream": False,
    "options": {"temperature": config.temperature},
    "keep_alive": config.keep_alive,
}
```

Para mudanças, a validação posterior também rejeita lista incompatível com `houve_mudanca_relevante` ou item sem confiança no próprio item, em seus objetos ou no nível geral. O runtime não sintetiza descrição nem resposta quando o campo semântico está ausente: erro de schema/execução vira `AnalysisData.erro` e é propagado para HTTP 500.

### Entrada que o runtime encaminha hoje

O runtime preenche `objeto_alvo`, `ultima_descricao`, `objetos_recentes` (lista vazia) e `pergunta`. Para `identify-change`, também encaminha a imagem anterior compactada, quando disponível. O Ollama recebe as imagens anexadas na ordem anterior → atual e instruções explícitas para compará-las.

`indice_mudanca_visual`, `regioes_alteradas` e `objetos_atuais` ainda não são calculados pelo pipeline. O percentual OpenCV direciona a política local e não é enviado ao Ollama. A imagem anterior, por outro lado, permite que a skill compare conteúdo visual de fato.

## 8. Skills disponíveis

| ID | Quando é selecionada | Saída estruturada esperada |
|---|---|---|
| `describe-environment` | Primeira chamada sem pergunta | Resultado de descrição com `resposta_semantica` e confiança. |
| `locate-object` | Pergunta que não foi classificada como risco/mudança | `objeto_encontrado`, dados de posição e `resposta_semantica`. |
| `identify-change` | Chamada sem pergunta após descrição ou pergunta sobre mudança | `houve_mudanca_relevante`, lista `mudancas`, confiança geral. |
| `detect-risk` | Pergunta classificada como risco | `possui_possivel_risco`, lista `riscos`, confiança geral. |

Os Markdown pedem respostas em JSON, confiança entre zero e um, linguagem cautelosa e ausência de garantias de segurança. Cada skill detalha as próprias entradas, enumerações e exemplos em seu `SKILL.md`.

### Conversão de resultados

O runtime converte localização/descrição em `AnalysisData`; mudanças e riscos são transformados em tuplas de `VisualEvent`. Para riscos, tipos contendo `OBSTACULO` viram `obstaculo`; os demais são mapeados para `risco`. Para mudanças, `BLOQUEIO` vira `risco`; outros tipos viram `mudanca`.

Cada mudança estruturada gera um `VisualEvent`. A confiança efetiva vem do item, do primeiro objeto alterado ou da confiança geral, nessa ordem; os metadados preservam o tipo original e a lista de objetos alterados. A descrição semântica é obrigatória no schema de descrição/localização, e o runtime não preenche campos ausentes com texto inventado.

## 9. Regras de comunicação

### Modelos de domínio

`rules/rules.py` define:

- `RulesConfig`: limites de confiança e cooldowns;
- `VisualEvent`: tipo, objeto, posição, proximidade, confiança, descrição e metadados;
- `AnalysisData`: resultado estruturado associado à sessão;
- `SessionMemory`: descrição inicial, última fala e eventos recentes;
- `ProcessingDecision`: fala, mensagem, prioridade, motivo e cooldown;
- `AnalysisError`: falha explícita de análise.

Valores padrão:

| Parâmetro | Padrão |
|---|---:|
| Confiança mínima de descrição | 0.60 |
| Confiança mínima de resposta | 0.65 |
| Confiança mínima de evento | 0.70 |
| Cooldown de descrição | 15 s |
| Cooldown de mudança | 10 s |
| Cooldown de risco | 5 s |

Os limites devem estar entre 0 e 1 e os cooldowns não podem ser negativos.

### Decisões

1. Uma `AnalysisData` com `erro` levanta `AnalysisError`.
2. Com pergunta, resposta semântica com confiança suficiente é falada; senão, um evento de confiança suficiente pode responder; sem evidência, a regra comunica que não foi possível confirmar.
3. Sem pergunta, eventos estruturados novos e suficientemente confiáveis são avaliados antes da descrição global; eventos físicos novos não são bloqueados pelo cooldown de fala.
4. Se não houver evento novo, a descrição inicial é falada somente se ainda não foi realizada e atinge o limiar; descrições textuais de mudança permanecem sujeitas a cooldown.
5. Sem evento relevante, a decisão é não falar (`SEM_EVENTO_RELEVANTE`).

O retorno de “não foi possível confirmar” em pergunta é uma decisão normal de baixa confiança, não uma descrição factual inventada nem um tratamento de exceção. A remoção dos fallbacks do `Processor` garante que indisponibilidade do modelo não seja confundida com uma resposta bem-sucedida.

`SessionManager` mantém em `eventos_recentes` apenas eventos anunciados. Isso evita que um evento abaixo do limiar seja deduplicado numa tentativa posterior. O `Processor` registra em nível `INFO` os campos `eventos`, `descricao`, `resposta_semantica` e `confianca_geral` imediatamente após o runtime para facilitar diagnóstico do fluxo.

O maior evento é selecionado pela confiança. Riscos recebem prioridade `ALTA`; mudanças recebem `INFORMATIVA`. Eventos de obstáculo/risco usam mensagens específicas quando há informação suficiente, e a regra não afirma que um trajeto está seguro.

## 10. Módulos Python, classes e funções

Esta seção cataloga cada arquivo Python presente em `backend`, fora de ambientes virtuais e caches.

### Aplicação

- `app/main.py`
  - `app`: instância FastAPI e processador no estado da aplicação.
  - `autenticar()`: valida `Authorization` usando comparação de tempo constante e o token configurado.
  - `validar_imagem_bytes()`: rejeita imagem vazia e tenta verificar a imagem com Pillow.
  - `health()`: rota `GET /health`.
  - `processar()`: rota `POST /processar`, entrada, chamada do processador e tradução de erros em HTTP.
- `app/config.py`
  - `Settings`: `BaseSettings` para `APP_TOKEN`, host/modelo Ollama e keep-alive.
  - `settings`: configuração carregada durante importação.
- `app/processor.py`
  - `ProcessingRequest`: `session_id`, bytes de imagem, pergunta e timestamp.
  - `ProcessingResult`: status e decisão serializável para a API.
  - `SessionManager`: getters/atualizadores de frame e memória efêmera.
  - `_build_runtime()`: compõe registry, executor, cliente Ollama e runtime.
  - `Processor.processar()`: compara frames, executa runtime/regras e atualiza estado somente em sucesso.

### Runtime e adaptadores de skill

- `agent_runtime/runtime.py`
  - `LocalizarObjetoResultado`, `MudancaResultado`, `RiscoResultado`: schemas Pydantic do modelo.
  - `AgentRuntime.processar()`: chama uma skill e converte sua saída em `AnalysisData`.
  - `_selecionar_skill()`: roteamento determinístico baseado na pergunta e na memória.
  - `_evento_mudanca()`: converte uma mudança estruturada em `VisualEvent`.
- `agent_runtime/markdown_loader.py`
  - `MarkdownLoader.load_skill()`: entrada pública para carregar uma skill.
  - `_load()`: valida caminho, tamanho, frontmatter, nome, instruções e executor; aplica cache.
  - `_split_frontmatter()`, `_parse_frontmatter()`, `_is_allowed()`: utilitários de parsing e segurança de caminho.
- `agent_runtime/skill_registry.py`
  - `SkillRegistry.discover()`: percorre diretórios de skills diretos.
  - `get_definition()`, `get_summary()`, `list_summaries()`, `contains()`: acesso às definições.
- `agent_runtime/skill_executor.py`
  - `SkillExecutor.execute()`: encontra a definição e o executor, mede duração e devolve resultado de sucesso/falha.
- `agent_runtime/executor_registry.py`
  - `SkillExecutorProtocol`: protocolo assíncrono esperado.
  - `ExecutorRegistry.register()` e `get()`: registro e resolução de executor.
- `agent_runtime/ollama_skill_executor.py`
  - `OllamaSkillExecutor.execute()`: exige imagem, prepara campos de entrada, solicita saída com schema e valida o JSON.
- `agent_runtime/ollama_client.py`
  - `OllamaConfig`: parâmetros HTTP/modelo.
  - `OllamaClient.analyze_image()`: monta payload multimodal.
  - `_post()`: POST assíncrono, valida resposta e traduz timeout/HTTP/resposta inválida em exceções tipadas.
- `agent_runtime/models.py`
  - `MarkdownDefinition`, `SkillSummary`, `SkillExecutionRequest`, `SkillExecutionResult`: estruturas dataclass imutáveis.
- `agent_runtime/exceptions.py`
  - `RuntimeErrorFarol` e exceções específicas de Markdown, registry e Ollama.
- `agent_runtime/__init__.py`
  - Exporta registry, loader, cliente, executor e `AgentRuntime` para os consumidores do pacote.

### Núcleo visual e regras

- `core/diff_visual.py`
  - `TAMANHO_FRAME`: `(128, 128)`.
  - `preparar_frame()`: decodifica grayscale e reduz a imagem.
  - `preparar_imagem_comparacao()`: armazena uma cópia JPEG reduzida da última imagem processada.
  - `houve_mudanca_visual()`: valida limiar e calcula diferença global normalizada.
- `core/__init__.py`
  - Pacote vazio para organização do núcleo.
- `rules/rules.py`
  - Modelos de domínio descritos na seção anterior.
  - `Rules.avaliar()`: decisão de fala.
  - `_avaliar_pergunta()`, `_deve_descrever_inicial()`, `_avaliar_novo_evento()`: políticas por tipo de análise.
  - `_maior_evento()`, `_tem_evento_relevante()`: seleção por confiança.
  - `_montar_mensagem_evento()`, `_posicao_para_texto()`: mensagem ao usuário.
  - `_conf_suficiente()`: comparação com limiar configurado.

### Testes e ferramenta auxiliar

- `tests/test_processor.py`: rotas, contrato de resposta, imagem inválida e falha do runtime sem fallback de sucesso.
- `tests/test_processor_stream.py`: frame estático não chama runtime, mudança local seleciona identificação, mudança drástica reseta contexto e força descrição, mapeamento de remoção, validação do schema, log de `AnalysisData` e anúncio de evento novo após fala recente.
- `tests/test_rules.py`: prioridade de evento estruturado, anúncio de mudança confiável, cooldown, limiar de confiança, deduplicação pela memória e classificação da pergunta.
- `tests/test_diff_visual.py`: primeiro frame, frames iguais, mudança acima do limiar, imagem inválida e compactação da imagem anterior.
- `tests/test_ollama_client.py`: ordem de envio das imagens, schema estrito enviado ao Ollama e rejeição de resposta incompatível.
- `debug_residencial.py`: cria um cliente de teste HTTP local e imprime resultado de uma chamada; é auxiliar, não é importado pelo servidor.

## 11. Dependências

As versões exatas estão fixadas em `backend/requirements.txt`. Dependências diretamente ligadas à arquitetura:

| Grupo | Pacotes |
|---|---|
| API e configuração | `fastapi`, `starlette`, `uvicorn`, `pydantic`, `pydantic-settings`, `python-dotenv` |
| Modelo e transporte | `httpx`, `httpcore`, `anthropic` |
| Imagem | `pillow`, `numpy`, `opencv-python-headless` |
| Skills | `PyYAML` |
| Testes | `pytest`, `pluggy`, `iniconfig` |
| Transporte/servidor e suporte | `anyio`, `h11`, `httptools`, `watchfiles`, `websockets`, `sniffio`, `idna`, `certifi`, `truststore`, `click`, `colorama`, `typing_extensions`, `typing-inspection`, `annotated-types`, `annotated-doc`, `pydantic_core`, `packaging`, `Pygments`, `docstring_parser`, `httpcore2`, `httpx2`, `jiter`, `opentelemetry-api` |

`anthropic` está no manifesto, porém o fluxo de runtime documentado usa `OllamaClient`/HTTPX e não importa o SDK Anthropic. A verificação de dependências no ambiente usado para esta documentação não reportou requisitos quebrados.

## 12. Testes e validação

Execute na pasta `backend`:

```powershell
..\.venv\Scripts\python.exe -m pytest -q
..\.venv\Scripts\python.exe -m pip check
```

A suíte executada durante a elaboração desta documentação passou com **27 testes**. Os testes de API substituem o runtime por doubles e não exigem um servidor Ollama ativo; o teste de descoberta valida os Markdown no disco.

## 13. Limites técnicos observáveis

- Estado de sessão é local ao processo, sem persistência, expiração ou sincronização entre workers.
- O detector visual compara pixels de frame completo e não compreende movimento de câmera nem regiões semânticas; seus limiares direcionam o fluxo, mas não detectam semanticamente a troca de cômodo.
- A comparação semântica depende da capacidade do modelo de interpretar duas imagens; a imagem anterior é uma cópia JPEG reduzida, não o arquivo original.
- Perguntas são roteadas por termos/substrings fixos; não existe planner ou classificador de intenção.
- Os dados de memória recente fornecidos ao modelo são parciais; as skills descrevem entradas que o pipeline não calcula ainda.
- Imagens não vazias rejeitadas pelo Pillow continuam sendo aceitas pela rota; OpenCV pode não produzir frame para elas.
- `OllamaConfig.max_retries` está declarado, mas o `OllamaClient` atual não repete a chamada.
- A API recebe `dict` em vez de schema validado de request, portanto a validação de tipos dos campos de entrada é manual e parcial.
- O status e a resposta 500 ocultam detalhes internos do cliente; a exceção completa é enviada ao logger.
- A resposta mantém o campo `fallback` para contrato, apesar de não existir mais recuperação que simule descrição ou resposta do modelo.

## 14. Referência rápida dos identificadores de skill

Os IDs precisam permanecer idênticos entre diretório, frontmatter e chaves de `AgentRuntime`:

```text
backend/skills/describe-environment/SKILL.md
backend/skills/locate-object/SKILL.md
backend/skills/identify-change/SKILL.md
backend/skills/detect-risk/SKILL.md
```

O loader rejeita mismatch entre `name` no frontmatter e o nome do diretório, e o runtime usa exatamente esses quatro IDs para roteamento e schema de saída.
