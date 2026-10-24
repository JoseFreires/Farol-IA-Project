# Orquestrador do Farol

## Visão geral

O orquestrador é a camada de **coordenação do fluxo** do sistema. Ele não recebe diretamente a requisição HTTP, não executa a análise visual e não armazena internamente o estado de todas as sessões.

Sua função é receber do endpoint um objeto interno já validado, identificar o contexto informado, selecionar o agente especializado adequado, consultar a memória curta por meio do `SessionManager`, encaminhar os dados estruturados às regras do contexto, coordenar fallbacks e **retornar o resultado final ao endpoint FastAPI por meio de uma chamada de método Python**. O orquestrador não cria uma nova requisição para o mobile. O endpoint usa esse retorno para responder à requisição HTTP original iniciada pelo aplicativo.

O orquestrador atua como ponto de coordenação entre:

- endpoint FastAPI;
- agentes especializados;
- gerenciador de sessão;
- regras específicas de cada contexto;
- serviços de fallback;
- logs e rastreamento do fluxo.

---

## 1. Fluxo da solução

```text
Mobile com câmera aberta
  ↓
Usuário seleciona o contexto
  ↓
Mobile guarda o contexto ativo
  ↓
Captura uma imagem
  ↓
Mobile envia contexto + imagem Base64 + sessionId
  ↓
FastAPI recebe e valida a entrada
  ↓
Endpoint POST /processar
  ↓
Criação do objeto interno validado
  ↓
Orquestrador identifica o contexto
  ↓
Orquestrador consulta a memória curta da sessão
  ↓
Orquestrador seleciona o agente especializado
  ↓
Agente executa as skills necessárias
  ↓
Skills utilizam Ollama, OCR e/ou Python
  ↓
Agente devolve dados estruturados
  ↓
Regras do contexto decidem se o resultado deve ser comunicado
  ↓
Orquestrador atualiza a memória curta
  ↓
Orquestrador retorna ResultadoProcessamento ao endpoint
  ↓
Endpoint converte o resultado em resposta HTTP/JSON
  ↓
Endpoint responde ao POST /processar original
  ↓
Mobile recebe o JSON
  ↓
Mobile reproduz a mensagem com TTS somente se deveFalar = true
```

---

## 2. Papel do endpoint FastAPI

O endpoint atua como ponte entre o mobile e o núcleo da aplicação.

### Responsabilidades do endpoint

- receber a requisição HTTP do mobile;
- validar os campos obrigatórios;
- validar o contexto informado;
- validar a imagem em Base64;
- validar o tamanho e o formato da imagem;
- decodificar a imagem quando necessário;
- criar um objeto interno de solicitação;
- encaminhar a solicitação validada ao orquestrador;
- transformar o resultado interno em uma resposta HTTP;
- devolver dados estruturados ao mobile;
- tratar erros de entrada com códigos HTTP adequados.

### Limite entre HTTP e o núcleo da aplicação

Antes de chamar o orquestrador, o endpoint deve:

1. receber o payload HTTP;
2. validar os campos e o contexto;
3. validar o tamanho e o formato da imagem;
4. remover o prefixo `data:image/...;base64,`, quando existir;
5. decodificar a imagem Base64 para `bytes`;
6. criar a `SolicitacaoProcessamento`;
7. chamar `await orquestrador.processar(solicitacao)`.

Dessa forma, o orquestrador não conhece HTTP, JSON ou Base64. O núcleo da aplicação trabalha com objetos internos e com a imagem já convertida para `bytes`.

### Endpoint recomendado

```python
@router.post("/processar")
async def processar(req: ProcessarRequest):
    ...
```

### Exemplo de entrada

```json
{
  "contexto": "RESIDENCIAL",
  "imagemBase64": "...",
  "pergunta": null,
  "sessionId": "abc123"
}
```

### Exemplo de saída esperada

```json
{
  "sessionId": "abc123",
  "contexto": "RESIDENCIAL",
  "status": "ok",
  "deveFalar": true,
  "mensagem": "Você está em uma sala. Há um sofá à frente e uma mesa à direita.",
  "prioridade": "INFORMATIVA",
  "idioma": "pt-BR",
  "fallback": false
}
```

---

## 3. Objetos estruturados

Os objetos estruturados separam:

- a entrada HTTP;
- o contrato interno da aplicação;
- os dados produzidos pelo agente;
- a decisão das regras do contexto;
- a resposta final.

Essa separação evita que o orquestrador dependa de um payload bruto do FastAPI e facilita a evolução da aplicação.

### Exemplo de solicitação interna

```python
from dataclasses import dataclass
from datetime import datetime


@dataclass
class SolicitacaoProcessamento:
    session_id: str
    contexto: str
    imagem: bytes
    pergunta: str | None
    timestamp: datetime
```

> A imagem pode ser decodificada pelo endpoint. Dessa forma, o núcleo da aplicação recebe `bytes` e não precisa conhecer detalhes do Base64 ou do transporte HTTP.

### Exemplo de dados produzidos pelo agente

```python
from dataclasses import dataclass, field
from typing import Any


@dataclass
class DadosAnalise:
    contexto: str
    eventos: list[dict[str, Any]] = field(default_factory=list)
    descricao: str | None = None
    confianca: float | None = None
    metadados: dict[str, Any] = field(default_factory=dict)
```

### Exemplo de retorno interno final

```python
@dataclass
class ResultadoProcessamento:
    session_id: str
    contexto: str
    status: str
    deve_falar: bool
    mensagem: str | None
    prioridade: str
    idioma: str = "pt-BR"
    fallback: bool = False
    motivo: str | None = None
```

Esses objetos:

- centralizam as informações úteis;
- facilitam testes unitários;
- reduzem o acoplamento entre FastAPI e orquestrador;
- facilitam a aplicação das regras do contexto;
- melhoram logs, depuração e manutenção.

---

## 4. Papel do agente orquestrador

O agente orquestrador recebe do endpoint uma solicitação já validada e coordena o fluxo necessário para processá-la.

### Responsabilidades do orquestrador

- receber do endpoint uma solicitação validada;
- identificar o contexto informado;
- selecionar o agente especializado correspondente;
- consultar a memória curta por meio do gerenciador de sessão;
- fornecer ao agente a imagem, a pergunta e o contexto recente;
- coordenar a execução do agente especializado;
- receber os dados estruturados produzidos pelo agente;
- encaminhar os dados às regras específicas do contexto;
- acionar fallbacks quando o processamento principal falhar;
- solicitar a atualização da memória curta após o processamento;
- centralizar logs de roteamento, falhas e decisões de fluxo;
- retornar um `ResultadoProcessamento` ao endpoint por meio da chamada de método que iniciou o fluxo.

### Fluxo de execução do orquestrador

```text
Solicitação validada
  ↓
Identificação do contexto
  ↓
Consulta da sessão no SessionManager
  ↓
Seleção do agente especializado
  ↓
Execução das skills pelo agente
  ↓
Recebimento dos dados estruturados
  ↓
Encaminhamento às regras do contexto
  ↓
Recebimento da decisão estruturada
  ↓
Atualização da memória pelo SessionManager
  ↓
Criação do ResultadoProcessamento
  ↓
Retorno do objeto para o endpoint que aguarda a chamada
```

---

## 5. O que o orquestrador não deve fazer

O orquestrador não deve:

- receber diretamente a requisição HTTP;
- validar o payload HTTP;
- decodificar Base64;
- analisar diretamente a imagem;
- executar OCR diretamente;
- chamar Ollama fora das skills;
- definir internamente pesos e limites das regras de cada contexto;
- armazenar dentro da própria classe o estado de todas as sessões;
- gerar áudio;
- executar TTS;
- implementar os detalhes internos das skills.

O orquestrador deve manter o problema no nível de **coordenação**, e não de execução técnica especializada.

---

## 6. Gerenciador de sessão e memória curta em RAM

A memória curta deve ser administrada por um componente próprio, como `SessionManager` ou `SessionStore`. O orquestrador consulta e atualiza esse componente, mas não mantém todas as sessões dentro de si.

### Responsabilidades do gerenciador de sessão

- criar uma sessão quando necessário;
- manter o contexto ativo;
- guardar a última descrição;
- manter objetos e eventos recentes;
- guardar alertas recentes;
- registrar a última comunicação;
- manter um histórico curto de perguntas;
- permitir consultas e atualizações pelo orquestrador;
- remover sessões inativas após um período definido.

### Estrutura mínima da sessão

```python
sessao = {
    "session_id": "abc123",
    "contexto_ativo": "RESIDENCIAL",
    "ultima_descricao": "Sala com sofá à frente e mesa à direita.",
    "objetos_recentes": [
        {"objeto": "sofa", "posicao": "frente", "confianca": 0.88},
        {"objeto": "mesa", "posicao": "direita", "confianca": 0.81}
    ],
    "ultimos_alertas": [],
    "historico_perguntas": ["Onde está a mesa?"],
    "ultima_fala_em": None,
    "ultima_deteccao_em": None
}
```

Essa sessão permite:

- manter o contexto ativo;
- responder perguntas relacionadas à análise recente;
- bloquear repetições;
- comparar mudanças entre análises;
- preparar a transição entre contextos.

### Observação sobre o MVP

Na V0, o armazenamento pode ser um dicionário em RAM. Essa abordagem é simples, mas possui limitações:

- os dados são perdidos ao reiniciar o backend;
- processos diferentes não compartilham a mesma memória;
- múltiplas instâncias do backend exigirão uma solução compartilhada no futuro.

---

## 7. Seleção do agente especializado

Na V0, a seleção do agente pode ser simples e determinística em Python.

### Exemplo com registro de agentes

```python
AGENTES = {
    "RESIDENCIAL": agente_residencial,
    "LEITURA": agente_leitura,
    "NAVEGACAO": agente_navegacao,
}

agente = AGENTES.get(contexto)

if agente is None:
    raise ContextoNaoSuportadoError(contexto)
```

Esse formato é preferível a uma longa sequência de `if/elif`, pois facilita a inclusão de novos agentes sem aumentar a complexidade do orquestrador.

### Agentes previstos

```text
RESIDENCIAL → Agente Residencial
LEITURA     → Agente de Leitura
NAVEGACAO   → Agente de Navegação
```

---

## 8. Papel do agente especializado e das skills

O agente especializado processa o contexto ativo. O agente contém a lógica de coordenação das skills necessárias àquele contexto.

### Responsabilidades do agente especializado

- receber a imagem, a pergunta e o contexto recente;
- selecionar uma ou mais skills;
- definir a ordem de execução;
- coordenar as skills;
- consolidar os resultados;
- devolver dados estruturados ao orquestrador.

### Papel das skills

As skills executam tarefas específicas e podem utilizar:

- Ollama;
- OCR;
- processamento Python;
- uma combinação desses recursos.

### Exemplos

```text
Skill de descrição do ambiente
  → Ollama

Skill de extração de texto
  → OCR

Skill de interpretação de documento
  → OCR + Ollama + Python

Skill de comparação de frames
  → Python
```

O agente produz dados de análise. O agente não deve decidir sozinho se toda informação deve ser comunicada ao usuário.

---

## 9. Regras do contexto

Cada agente produz dados estruturados. Um componente de regras específico do contexto avalia esses dados e decide se o resultado deve ser comunicado.

### Responsabilidades das regras

- verificar se existe risco imediato;
- considerar perguntas explícitas do usuário;
- avaliar confiança mínima;
- verificar repetição recente;
- determinar relevância;
- atribuir prioridade;
- decidir se o resultado deve ser comunicado;
- montar a mensagem final em pt-BR.

### Exemplos de regra

- se houver risco imediato, comunicar;
- se o usuário fez uma pergunta e existe resposta confiável, comunicar;
- se o evento foi comunicado recentemente, silenciar;
- se a confiança do evento for baixa, não comunicar como certeza;
- se a mudança não for relevante, armazenar na memória sem comunicar.

### Organização sugerida

```text
rules/
├── residential_rules.py
├── navigation_rules.py
└── reading_rules.py
```

Essa camada é fundamental para reduzir ruído, evitar repetição e manter um comportamento previsível.

---

## 10. Fallbacks

Quando um agente, uma skill ou um recurso de processamento falhar, o orquestrador coordena o fallback adequado.

### Exemplos de fallback

- modelo indisponível: “Não consegui analisar o ambiente agora.”;
- imagem muito escura: “A imagem está escura. Direcione a câmera para outra posição.”;
- perda de conexão: “Conexão com o serviço de análise perdida.”;
- falha de OCR: “Não foi possível ler o texto com confiança neste enquadramento.”;
- contexto não suportado: “Este contexto ainda não está disponível.”

O componente que encontra a falha deve informar um erro estruturado. O orquestrador decide qual caminho alternativo utilizar e garante que o endpoint receba uma resposta consistente.

---

## 11. Logs e rastreamento

Cada componente pode produzir seus próprios logs, enquanto o orquestrador centraliza o rastreamento do fluxo.

### Informações relevantes para os logs

- identificador da sessão;
- contexto informado;
- agente selecionado;
- skills executadas;
- recursos utilizados;
- tempo de processamento;
- falhas encontradas;
- fallback acionado;
- decisão das regras;
- prioridade final;
- decisão de comunicar ou silenciar.

Imagens, documentos e informações pessoais não devem ser registrados indiscriminadamente.

---

## 12. Exemplo de execução mínima

```python
class Orquestrador:
    def __init__(
        self,
        session_manager,
        agent_registry,
        rules_registry,
        fallback_service,
        logger,
    ):
        self.session_manager = session_manager
        self.agent_registry = agent_registry
        self.rules_registry = rules_registry
        self.fallback_service = fallback_service
        self.logger = logger

    async def processar(
        self,
        solicitacao: SolicitacaoProcessamento,
    ) -> ResultadoProcessamento:
        try:
            sessao = self.session_manager.get_or_create(
                solicitacao.session_id
            )

            sessao["contexto_ativo"] = solicitacao.contexto

            agente = self.agent_registry.get(solicitacao.contexto)
            regras = self.rules_registry.get(solicitacao.contexto)

            if agente is None or regras is None:
                raise ContextoNaoSuportadoError(
                    solicitacao.contexto
                )

            contexto_recente = {
                "ultima_descricao": sessao.get("ultima_descricao"),
                "objetos_recentes": sessao.get("objetos_recentes", []),
                "ultimos_alertas": sessao.get("ultimos_alertas", []),
                "historico_perguntas": sessao.get(
                    "historico_perguntas", []
                ),
            }

            dados_analise = await agente.processar(
                imagem=solicitacao.imagem,
                pergunta=solicitacao.pergunta,
                contexto_recente=contexto_recente,
            )

            resultado_final = regras.avaliar(
                dados_analise=dados_analise,
                sessao=sessao,
                pergunta=solicitacao.pergunta,
            )

            self.session_manager.atualizar(
                solicitacao.session_id,
                dados_analise,
                resultado_final,
            )

            self.logger.info(
                "Processamento concluído",
                extra={
                    "session_id": solicitacao.session_id,
                    "contexto": solicitacao.contexto,
                    "deve_falar": resultado_final.deve_falar,
                    "prioridade": resultado_final.prioridade,
                },
            )

            return resultado_final

        except Exception as erro:
            self.logger.exception(
                "Falha no processamento",
                extra={
                    "session_id": solicitacao.session_id,
                    "contexto": solicitacao.contexto,
                },
            )

            return self.fallback_service.criar_resultado(
                solicitacao=solicitacao,
                erro=erro,
            )
```

---

## 13. Estrutura sugerida de arquivos

```text
backend/
├── api/
│   ├── routes/
│   │   └── processing_routes.py
│   └── schemas/
│       ├── processing_request.py
│       └── processing_response.py
├── application/
│   ├── orchestrator.py
│   ├── agent_registry.py
│   ├── rules_registry.py
│   └── session_manager.py
├── agents/
│   ├── base_agent.py
│   ├── residential_agent.py
│   ├── navigation_agent.py
│   └── reading_agent.py
├── skills/
│   ├── scene_description_skill.py
│   ├── obstacle_detection_skill.py
│   ├── frame_comparison_skill.py
│   ├── ocr_skill.py
│   └── document_reading_skill.py
├── rules/
│   ├── residential_rules.py
│   ├── navigation_rules.py
│   └── reading_rules.py
├── services/
│   ├── ollama_service.py
│   ├── ocr_service.py
│   ├── fallback_service.py
│   └── image_service.py
└── domain/
    ├── requests.py
    ├── results.py
    └── exceptions.py
```

---

## 14. Retorno da requisição ao mobile

O agente especializado e o orquestrador não fazem uma nova requisição para o mobile.

O fluxo de retorno acontece pela mesma pilha de chamadas iniciada pelo endpoint:

```text
Mobile faz POST /processar
  ↓
Endpoint chama orquestrador.processar(...)
  ↓
Orquestrador chama agente.processar(...)
  ↓
Agente executa as skills
  ↓
Agente retorna DadosAnalise ao orquestrador
  ↓
Orquestrador encaminha DadosAnalise às regras
  ↓
Regras retornam DecisaoContexto
  ↓
Orquestrador atualiza o SessionManager
  ↓
Orquestrador retorna ResultadoProcessamento ao endpoint
  ↓
Endpoint responde ao POST original com HTTP/JSON
  ↓
Mobile recebe o JSON e executa TTS quando deveFalar = true
```

### Chamadas internas e comunicação HTTP

Entre os componentes do backend são usadas chamadas de método Python:

```python
resultado = await orquestrador.processar(solicitacao)
```

```python
dados_analise = await agente.processar(
    solicitacao=solicitacao,
    memoria=memoria,
)
```

A comunicação HTTP existe em dois pontos distintos:

1. entre o mobile e o endpoint FastAPI, por meio do `POST /processar`;
2. entre uma skill/client e um serviço externo, como o Ollama, quando necessário.

O retorno ao mobile **não é um novo POST**. É a resposta HTTP da requisição original.

### Ordem obrigatória antes do retorno

O endpoint só recebe o resultado final depois desta sequência:

```text
Dados produzidos pelo agente
  ↓
Aplicação das regras do contexto
  ↓
Decisão de relevância, prioridade, repetição e cooldown
  ↓
Tratamento de fallback, quando necessário
  ↓
Atualização da memória da sessão
  ↓
ResultadoProcessamento
  ↓
Resposta HTTP/JSON
```

Mesmo quando as regras decidem não comunicar algo, o endpoint pode responder normalmente:

```json
{
  "sessionId": "abc123",
  "contexto": "RESIDENCIAL",
  "status": "ok",
  "deveFalar": false,
  "mensagem": null,
  "prioridade": "NENHUMA",
  "idioma": "pt-BR",
  "fallback": false
}
```

Nesse caso, o mobile recebe a resposta, mas não executa o TTS.

---

## 15. Critérios de sucesso do orquestrador

O orquestrador está correto quando:

- recebe somente objetos internos validados;
- seleciona o agente correto conforme o contexto;
- consulta a sessão por meio do gerenciador de sessão;
- fornece memória curta ao agente;
- encaminha os dados às regras apropriadas;
- bloqueia falas repetidas por meio das regras e da memória;
- coordena fallbacks confiáveis;
- atualiza a memória após o processamento;
- registra as principais decisões do fluxo;
- devolve um resultado estruturado ao endpoint;
- não depende de banco de dados no MVP;
- não executa diretamente responsabilidades das skills.

---

## 16. Conclusão

O orquestrador é a camada de coordenação do Farol. Ele recebe uma entrada interna já validada e com a imagem decodificada em `bytes`, identifica o contexto, seleciona o agente especializado, consulta a memória recente no `SessionManager`, coordena regras e fallbacks e retorna um `ResultadoProcessamento` ao endpoint. O endpoint converte esse objeto em JSON e responde à requisição HTTP original do mobile.

Essa organização permite que o projeto evolua de um simples descritor de imagens para um assistente visual contextual, sem concentrar toda a lógica em uma única classe.

O endpoint `POST /processar` e os objetos estruturados são coerentes com a arquitetura da V0 porque deixam clara a separação entre:

- transporte HTTP;
- validação da entrada;
- coordenação do fluxo;
- execução dos agentes e skills;
- utilização de Ollama, OCR e/ou Python;
- tomada de decisão por regras;
- memória curta da sessão;
- resposta ao mobile.
