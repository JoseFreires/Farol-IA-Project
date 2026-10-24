---
name: agente-residencial
description: Interpreta o ambiente residencial, identifica objetos relevantes, responde perguntas sobre o espaço e entrega dados estruturados para o orquestrador sem decidir fala, prioridade ou cooldown.
version: "0.2.0"
language: pt-BR
executor: ollama
---

# Agente Residencial do Farol

## Visão geral

O agente residencial é responsável por **interpretar o ambiente doméstico e produzir dados estruturados** sobre objetos, descrições, mudanças e possíveis riscos.

O agente residencial não é responsável por:

- selecionar o contexto ativo;
- receber ou validar requisições HTTP;
- decodificar imagens em Base64;
- manter diretamente as sessões em RAM;
- decidir sozinho se uma informação deve ser falada;
- calcular a prioridade final, o cooldown ou a repetição;
- gerar áudio ou executar TTS;
- criar a resposta HTTP enviada ao mobile.

O endpoint FastAPI valida a entrada e converte a imagem Base64 para `bytes`. O orquestrador seleciona o agente residencial, consulta a memória recente pelo `SessionManager` e entrega ao agente uma solicitação interna já validada.

Após executar suas skills, o agente devolve `DadosAnaliseResidencial`. O orquestrador encaminha esses dados para `ResidentialRules`, que decide relevância, prioridade, repetição, cooldown e necessidade de comunicação.

```text
Endpoint FastAPI
  ↓ solicitação validada e imagem em bytes
Orquestrador
  ↓ solicitação + memória curta
Agente Residencial
  ↓ coordena as skills
Ollama, OCR e/ou Python
  ↓
DadosAnaliseResidencial
  ↓
ResidentialRules
  ↓
DecisaoContexto
  ↓
Orquestrador atualiza o SessionManager
  ↓
ResultadoProcessamento
  ↓
Endpoint responde ao POST original
  ↓
Mobile executa TTS se deveFalar = true
```

---

## 1. Objetivo

O objetivo do agente residencial é apoiar a análise de ambientes domésticos de maneira curta, útil e controlada, sem transformar cada frame em uma narração completa.

O agente deve ser capaz de:

- produzir uma descrição inicial curta do ambiente;
- identificar objetos e móveis relevantes;
- localizar objetos solicitados pelo usuário;
- responder semanticamente a perguntas sobre o ambiente recente;
- detectar mudanças entre análises;
- identificar possíveis obstáculos ou riscos domésticos;
- consolidar os resultados das skills;
- devolver dados estruturados ao orquestrador.

A decisão final de comunicar algo ao usuário pertence às regras residenciais, não ao agente.

---

## 2. Contrato de entrada

Todos os agentes especializados devem receber o mesmo contrato mínimo da aplicação.

```python
from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class Contexto(str, Enum):
    RESIDENCIAL = "RESIDENCIAL"
    NAVEGACAO = "NAVEGACAO"
    LEITURA = "LEITURA"


@dataclass(frozen=True)
class SolicitacaoProcessamento:
    session_id: str
    contexto: Contexto
    imagem: bytes
    pergunta: str | None
    timestamp: datetime
```

### Responsabilidade do endpoint antes da criação do contrato

Antes de criar `SolicitacaoProcessamento`, o endpoint FastAPI deve:

1. receber o payload HTTP;
2. validar os campos obrigatórios;
3. validar o contexto informado;
4. validar o tamanho e o formato da imagem;
5. remover o prefixo `data:image/...;base64,`, quando existir;
6. decodificar a imagem Base64 para `bytes`;
7. criar o objeto interno;
8. chamar o orquestrador.

Com isso, o agente residencial não conhece HTTP, JSON ou Base64.

### Memória curta

A memória recente não faz parte do payload enviado pelo mobile. O orquestrador recupera essa informação no `SessionManager` e a entrega separadamente ao agente.

```python
from dataclasses import dataclass, field


@dataclass
class MemoriaResidencial:
    descricao_inicial_realizada: bool = False
    ultima_descricao: str | None = None
    objetos_recentes: list[dict] = field(default_factory=list)
    eventos_recentes: list[dict] = field(default_factory=list)
    alertas_recentes: list[dict] = field(default_factory=list)
    historico_perguntas: list[str] = field(default_factory=list)
    frame_anterior: bytes | None = None
```

### Assinatura comum do agente

```python
class AgenteResidencial:
    async def processar(
        self,
        solicitacao: SolicitacaoProcessamento,
        memoria: MemoriaResidencial,
    ) -> "DadosAnaliseResidencial":
        ...
```

---

## 3. Contrato de saída do agente

O agente residencial deve devolver somente dados da análise. A saída do agente não deve conter a decisão final de comunicação.

### Evento residencial

```python
from dataclasses import dataclass
from typing import Any


@dataclass
class EventoResidencial:
    tipo: str
    objeto: str | None
    posicao: str | None
    proximidade: str | None
    confianca: float
    descricao: str | None = None
    metadados: dict[str, Any] | None = None
```

### Dados consolidados da análise

```python
from dataclasses import dataclass, field
from typing import Any


@dataclass
class DadosAnaliseResidencial:
    session_id: str
    contexto: Contexto
    descricao: str | None = None
    resposta_semantica: str | None = None
    objetos: list[dict[str, Any]] = field(default_factory=list)
    eventos: list[EventoResidencial] = field(default_factory=list)
    confianca_geral: float | None = None
    metadados: dict[str, Any] = field(default_factory=dict)
    erro: str | None = None
```

### Exemplo de saída do agente

```json
{
  "session_id": "abc123",
  "contexto": "RESIDENCIAL",
  "descricao": "Sala com sofá à frente e mesa à direita.",
  "resposta_semantica": null,
  "objetos": [
    {
      "objeto": "sofa",
      "posicao": "frente",
      "confianca": 0.88
    },
    {
      "objeto": "mesa",
      "posicao": "direita",
      "confianca": 0.81
    }
  ],
  "eventos": [],
  "confianca_geral": 0.84,
  "metadados": {},
  "erro": null
}
```

### Campos que não pertencem à saída do agente

Os seguintes campos devem ser produzidos somente após a aplicação de `ResidentialRules`:

- `deve_falar`;
- `mensagem` final;
- `prioridade`;
- `cooldown_segundos`;
- `fallback`;
- `motivo` da decisão final.

---

## 4. Responsabilidades do agente residencial

### 4.1 Coordenar as skills

O agente decide quais skills executar e em qual ordem, conforme:

- a existência de uma pergunta;
- a necessidade de descrição inicial;
- a existência de um frame anterior;
- o estado recente do ambiente;
- os resultados parciais produzidos pelas skills.

### 4.2 Produzir a descrição inicial

Quando o contexto residencial é ativado e a memória indica que ainda não houve descrição inicial, o agente pode executar a skill de descrição do ambiente.

Exemplo de dado produzido:

```text
Sala com sofá à frente, mesa à direita e porta à esquerda.
```

Esse texto ainda não é automaticamente falado. `ResidentialRules` avalia se a descrição inicial deve ser comunicada.

### 4.3 Identificar objetos e móveis principais

Objetos iniciais de interesse:

- sofá;
- mesa;
- cadeira;
- porta;
- janela;
- televisão;
- cama;
- armário;
- objetos possivelmente bloqueando o caminho.

### 4.4 Responder semanticamente a perguntas

Perguntas previstas:

- “O que tem sobre a mesa?”
- “Onde está o sofá?”
- “Existe uma porta por perto?”
- “Descreva o ambiente com mais detalhes.”

O agente pode usar a imagem atual e a memória recente, mas deve indicar a origem e a confiança da resposta sempre que possível.

### 4.5 Detectar mudanças

Mudanças possíveis:

- objeto novo;
- objeto removido;
- alteração aproximada de posição;
- possível obstáculo novo;
- mudança relevante em uma área observada.

O agente apenas produz eventos. As regras decidem se a mudança merece comunicação.

### 4.6 Identificar possíveis riscos domésticos

O agente deve utilizar linguagem interna compatível com incerteza, por exemplo:

- `POSSIVEL_OBSTACULO`;
- `POSSIVEL_BLOQUEIO`;
- `POSSIVEL_RISCO`.

Uma câmera comum e um modelo visual não devem ser tratados como instrumentos capazes de garantir que um caminho está seguro.

---

## 5. Skills do agente residencial

As skills devem ser pequenas, específicas, testáveis e reutilizáveis.

### 5.1 `descrever_ambiente`

**Objetivo:** produzir uma descrição curta do ambiente e identificar elementos principais.

**Entradas:**

- imagem atual;
- última descrição;
- objetos recentemente identificados.

**Recursos possíveis:**

- Ollama;
- processamento Python para validação e normalização.

**Saída:**

```python
{
    "descricao": "Sala com sofá à frente e mesa à direita.",
    "objetos": [
        {"objeto": "sofa", "posicao": "frente", "confianca": 0.88},
        {"objeto": "mesa", "posicao": "direita", "confianca": 0.81},
    ],
    "confianca": 0.84,
}
```

### 5.2 `localizar_objeto`

**Objetivo:** procurar um objeto solicitado pelo usuário.

**Entradas:**

- imagem;
- objeto procurado;
- objetos recentes;
- última descrição.

**Saída:**

```python
{
    "objeto_procurado": "sofa",
    "encontrado": True,
    "posicao": "frente",
    "proximidade": None,
    "confianca": 0.86,
    "fonte": "ANALISE_ATUAL",
}
```

### 5.3 `identificar_mudanca`

**Objetivo:** consolidar mudanças sem decidir se devem ser comunicadas.

**Entradas:**

- objetos atuais;
- objetos recentes;
- resultado da comparação de frames.

**Saída:**

```python
{
    "mudancas": [
        {
            "tipo": "OBJETO_NOVO",
            "objeto": "cadeira",
            "posicao": "frente",
            "confianca": 0.82,
        }
    ]
}
```

### 5.4 `detectar_risco_domiciliar`

**Objetivo:** produzir eventos de possível risco ou obstáculo.

**Entradas:**

- imagem atual;
- objetos detectados;
- informações aproximadas de posição e proximidade.

**Saída:**

```python
{
    "eventos": [
        {
            "tipo": "POSSIVEL_OBSTACULO",
            "objeto": "cadeira",
            "posicao": "frente",
            "proximidade": "perto",
            "confianca": 0.82,
        }
    ]
}
```

A skill não atribui `prioridade` e não decide `deve_falar`.

### 5.5 `responder_pergunta_ambiente`

**Objetivo:** gerar uma resposta semântica a partir da pergunta, da imagem e da memória recente.

**Entradas:**

- pergunta;
- imagem atual;
- memória recente;
- objetos conhecidos.

**Saída:**

```python
{
    "pergunta_compreendida": True,
    "resposta_semantica": "O sofá foi identificado à frente.",
    "confianca": 0.86,
    "fonte": "ANALISE_ATUAL",
}
```

A skill não define `deve_falar`. A existência de uma pergunta explícita será considerada por `ResidentialRules`.

### 5.6 `comparar_frames`

**Objetivo:** comparar o frame atual com o anterior e fornecer indicadores de mudança.

**Entradas:**

- frame atual;
- frame anterior.

**Recursos possíveis:**

- processamento Python;
- biblioteca de visão computacional, se adotada.

**Saída:**

```python
{
    "houve_mudanca_visual": True,
    "indice_mudanca": 0.34,
    "regioes_alteradas": ["centro"],
}
```

Essa skill não deve afirmar semanticamente qual objeto mudou sem apoio de outra análise.

---

## 6. Execução interna do agente

O agente deve coordenar as skills e consolidar os resultados, sem produzir a decisão final de comunicação.

```python
class AgenteResidencial:
    def __init__(
        self,
        descricao_skill,
        localizacao_skill,
        mudanca_skill,
        risco_skill,
        pergunta_skill,
        comparacao_skill,
    ):
        self.descricao_skill = descricao_skill
        self.localizacao_skill = localizacao_skill
        self.mudanca_skill = mudanca_skill
        self.risco_skill = risco_skill
        self.pergunta_skill = pergunta_skill
        self.comparacao_skill = comparacao_skill

    async def processar(
        self,
        solicitacao: SolicitacaoProcessamento,
        memoria: MemoriaResidencial,
    ) -> DadosAnaliseResidencial:
        objetos = []
        eventos = []
        descricao = None
        resposta_semantica = None
        confiancas = []

        if memoria.frame_anterior is not None:
            comparacao = await self.comparacao_skill.executar(
                frame_atual=solicitacao.imagem,
                frame_anterior=memoria.frame_anterior,
            )
        else:
            comparacao = None

        if solicitacao.pergunta:
            resposta = await self.pergunta_skill.executar(
                pergunta=solicitacao.pergunta,
                imagem=solicitacao.imagem,
                memoria=memoria,
            )
            resposta_semantica = resposta.get("resposta_semantica")
            if resposta.get("confianca") is not None:
                confiancas.append(resposta["confianca"])

        if not memoria.descricao_inicial_realizada or comparacao is None or comparacao.get("houve_mudanca_visual"):
            analise_ambiente = await self.descricao_skill.executar(
                imagem=solicitacao.imagem,
                memoria=memoria,
            )
            descricao = analise_ambiente.get("descricao")
            objetos = analise_ambiente.get("objetos", [])
            if analise_ambiente.get("confianca") is not None:
                confiancas.append(analise_ambiente["confianca"])

            mudancas = await self.mudanca_skill.executar(
                objetos_atuais=objetos,
                objetos_recentes=memoria.objetos_recentes,
                comparacao=comparacao,
            )

            riscos = await self.risco_skill.executar(
                imagem=solicitacao.imagem,
                objetos=objetos,
            )

            eventos.extend(mudancas.get("mudancas", []))
            eventos.extend(riscos.get("eventos", []))

        confianca_geral = (
            sum(confiancas) / len(confiancas)
            if confiancas
            else None
        )

        return DadosAnaliseResidencial(
            session_id=solicitacao.session_id,
            contexto=solicitacao.contexto,
            descricao=descricao,
            resposta_semantica=resposta_semantica,
            objetos=objetos,
            eventos=eventos,
            confianca_geral=confianca_geral,
            metadados={
                "comparacao_frames": comparacao,
            },
        )
```

O exemplo acima é uma referência inicial. A V0 pode executar menos skills para reduzir latência.

---

## 7. Regras residenciais

`ResidentialRules` recebe os dados do agente e a memória recuperada pelo `SessionManager`.

### Responsabilidades

- avaliar confiança mínima;
- identificar possíveis riscos relevantes;
- considerar perguntas explícitas;
- verificar se a descrição inicial é necessária;
- avaliar mudanças relevantes;
- controlar repetição;
- aplicar cooldown;
- atribuir prioridade;
- decidir se o resultado deve ser comunicado;
- produzir a mensagem final em pt-BR.

### Contrato da decisão

```python
from dataclasses import dataclass


@dataclass
class DecisaoContexto:
    deve_falar: bool
    mensagem: str | None
    prioridade: str
    motivo: str
    cooldown_segundos: int | None = None
```

### Exemplo de aplicação

```python
class ResidentialRules:
    def avaliar(
        self,
        dados: DadosAnaliseResidencial,
        memoria: MemoriaResidencial,
        pergunta: str | None,
    ) -> DecisaoContexto:
        if dados.erro:
            raise AnaliseResidencialError(dados.erro)

        risco = self._selecionar_risco_relevante(dados.eventos)
        if risco and not self._esta_em_cooldown(risco, memoria):
            return DecisaoContexto(
                deve_falar=True,
                mensagem=self._montar_alerta(risco),
                prioridade="ALTA",
                motivo="POSSIVEL_RISCO_RESIDENCIAL",
                cooldown_segundos=5,
            )

        if pergunta and dados.resposta_semantica:
            return DecisaoContexto(
                deve_falar=True,
                mensagem=dados.resposta_semantica,
                prioridade="INFORMATIVA",
                motivo="RESPOSTA_A_PERGUNTA",
            )

        if (
            not memoria.descricao_inicial_realizada
            and dados.descricao
        ):
            return DecisaoContexto(
                deve_falar=True,
                mensagem=dados.descricao,
                prioridade="INFORMATIVA",
                motivo="DESCRICAO_INICIAL",
            )

        mudanca = self._selecionar_mudanca_relevante(
            dados.eventos,
            memoria,
        )
        if mudanca:
            return DecisaoContexto(
                deve_falar=True,
                mensagem=self._montar_mensagem_mudanca(mudanca),
                prioridade="INFORMATIVA",
                motivo="MUDANCA_RELEVANTE",
                cooldown_segundos=10,
            )

        return DecisaoContexto(
            deve_falar=False,
            mensagem=None,
            prioridade="NENHUMA",
            motivo="SEM_EVENTO_RELEVANTE",
        )
```

Os valores de confiança e cooldown devem ser configuráveis e ajustados com testes. Não devem ser tratados inicialmente como parâmetros definitivos.

---

## 8. Coordenação pelo orquestrador

O orquestrador coordena agente, regras, sessão e fallback.

```python
async def processar_residencial(
    solicitacao: SolicitacaoProcessamento,
) -> ResultadoProcessamento:
    memoria = session_manager.obter_memoria_residencial(
        solicitacao.session_id
    )

    try:
        dados = await agente_residencial.processar(
            solicitacao=solicitacao,
            memoria=memoria,
        )

        decisao = residential_rules.avaliar(
            dados=dados,
            memoria=memoria,
            pergunta=solicitacao.pergunta,
        )

        session_manager.atualizar_residencial(
            session_id=solicitacao.session_id,
            dados=dados,
            decisao=decisao,
            frame_atual=solicitacao.imagem,
        )

        return ResultadoProcessamento(
            session_id=solicitacao.session_id,
            contexto=solicitacao.contexto,
            status="ok",
            deve_falar=decisao.deve_falar,
            mensagem=decisao.mensagem,
            prioridade=decisao.prioridade,
            idioma="pt-BR",
            fallback=False,
            motivo=decisao.motivo,
        )

    except Exception as erro:
        return fallback_service.criar_resultado(
            solicitacao=solicitacao,
            erro=erro,
        )
```

O orquestrador retorna `ResultadoProcessamento` ao endpoint. O endpoint responde à requisição `POST /processar` original. Não existe uma nova requisição do agente ou do orquestrador para o mobile.

---

## 9. Fallbacks

O agente e as skills devem identificar falhas por meio de erros ou códigos estruturados. A mensagem final de fallback é coordenada pelo orquestrador por meio de um serviço próprio.

### Possíveis códigos

```text
IMAGEM_ESCURA
IMAGEM_INVALIDA
MODELO_INDISPONIVEL
TIMEOUT_MODELO
OBJETO_NAO_LOCALIZADO
CONFIANCA_INSUFICIENTE
```

### Exemplo de dado de erro do agente

```json
{
  "session_id": "abc123",
  "contexto": "RESIDENCIAL",
  "descricao": null,
  "resposta_semantica": null,
  "objetos": [],
  "eventos": [],
  "confianca_geral": null,
  "metadados": {},
  "erro": "IMAGEM_ESCURA"
}
```

### Exemplo de resultado final de fallback

```json
{
  "sessionId": "abc123",
  "contexto": "RESIDENCIAL",
  "status": "erro",
  "deveFalar": true,
  "mensagem": "A imagem está escura. Direcione a câmera para outra posição.",
  "prioridade": "INFORMATIVA",
  "idioma": "pt-BR",
  "fallback": true,
  "motivo": "IMAGEM_ESCURA"
}
```

---

## 10. Exemplos completos

### 10.1 Descrição inicial

#### Dados produzidos pelo agente

```json
{
  "descricao": "Sala com sofá à frente e mesa à direita.",
  "resposta_semantica": null,
  "objetos": [
    {
      "objeto": "sofa",
      "posicao": "frente",
      "confianca": 0.88
    }
  ],
  "eventos": [],
  "confianca_geral": 0.84,
  "erro": null
}
```

#### Decisão das regras

```json
{
  "deve_falar": true,
  "mensagem": "Sala com sofá à frente e mesa à direita.",
  "prioridade": "INFORMATIVA",
  "motivo": "DESCRICAO_INICIAL",
  "cooldown_segundos": null
}
```

### 10.2 Pergunta sobre objeto

#### Dados produzidos pelo agente

```json
{
  "descricao": null,
  "resposta_semantica": "O sofá foi identificado à frente.",
  "objetos": [
    {
      "objeto": "sofa",
      "posicao": "frente",
      "confianca": 0.86
    }
  ],
  "eventos": [],
  "confianca_geral": 0.86,
  "erro": null
}
```

#### Decisão das regras

```json
{
  "deve_falar": true,
  "mensagem": "O sofá foi identificado à frente.",
  "prioridade": "INFORMATIVA",
  "motivo": "RESPOSTA_A_PERGUNTA",
  "cooldown_segundos": null
}
```

### 10.3 Possível obstáculo

#### Dados produzidos pelo agente

```json
{
  "descricao": null,
  "resposta_semantica": null,
  "objetos": [
    {
      "objeto": "cadeira",
      "posicao": "frente",
      "confianca": 0.82
    }
  ],
  "eventos": [
    {
      "tipo": "POSSIVEL_OBSTACULO",
      "objeto": "cadeira",
      "posicao": "frente",
      "proximidade": "perto",
      "confianca": 0.82
    }
  ],
  "confianca_geral": 0.82,
  "erro": null
}
```

#### Decisão das regras

```json
{
  "deve_falar": true,
  "mensagem": "Atenção, possível cadeira à frente.",
  "prioridade": "ALTA",
  "motivo": "POSSIVEL_RISCO_RESIDENCIAL",
  "cooldown_segundos": 5
}
```

### 10.4 Sem necessidade de comunicação

```json
{
  "deve_falar": false,
  "mensagem": null,
  "prioridade": "NENHUMA",
  "motivo": "SEM_EVENTO_RELEVANTE",
  "cooldown_segundos": null
}
```

O endpoint ainda pode responder normalmente ao mobile. O mobile não executa TTS quando `deveFalar` for `false`.

---

## 11. Regras de segurança e comunicação

O sistema deve evitar mensagens que indiquem certeza de segurança sem dados suficientes.

### Evitar

```text
O caminho está seguro.
Há espaço suficiente para passar.
Você pode seguir sem risco.
```

### Preferir

```text
Uma cadeira foi identificada à frente.
Possível obstáculo próximo.
Não foi possível confirmar se a passagem está livre.
```

O agente residencial é uma ferramenta assistiva experimental. O sistema não substitui bengala, cão-guia, orientação e mobilidade profissional ou avaliação humana do ambiente.

---

## 12. Critérios de sucesso

O agente residencial estará funcional quando:

- receber o contrato comum da aplicação;
- receber memória curta separadamente;
- selecionar e coordenar as skills residenciais;
- produzir descrições curtas e estruturadas;
- identificar objetos principais;
- responder semanticamente a perguntas simples;
- produzir eventos de mudança e possível risco;
- retornar `DadosAnaliseResidencial` sem decisão final de comunicação;
- não depender diretamente de HTTP, Base64 ou FastAPI;
- não controlar TTS;
- não armazenar sessões internamente;
- funcionar sem banco de dados na V0;
- permitir testes unitários com clients e skills simulados.

---

## 13. Escopo da V0

A V0 deve priorizar:

- descrição inicial curta;
- identificação de poucos objetos principais;
- resposta a perguntas simples;
- comparação básica entre frames;
- possível detecção de mudança relevante;
- memória curta em RAM pelo `SessionManager`;
- regras residenciais simples e configuráveis;
- cooldown básico;
- fallback estruturado.

A V0 não deve tentar:

- mapear completamente a residência;
- garantir caminho livre;
- estimar distâncias exatas com uma câmera comum;
- reconhecer permanentemente todos os objetos;
- tomar decisões autônomas de segurança;
- manter memória persistente entre reinicializações.

---

## 14. Conclusão

O agente residencial é o primeiro agente especializado do Farol. O agente coordena skills que utilizam Ollama, OCR e/ou processamento Python e devolve dados estruturados sobre o ambiente doméstico.

A arquitetura mantém a separação de responsabilidades:

```text
Endpoint valida e decodifica
  ↓
Orquestrador coordena
  ↓
SessionManager fornece memória curta
  ↓
Agente Residencial analisa
  ↓
Skills executam capacidades específicas
  ↓
ResidentialRules decide a comunicação
  ↓
Orquestrador atualiza a sessão e cria o resultado
  ↓
Endpoint responde ao POST original
  ↓
Mobile executa TTS quando necessário
```

Essa divisão torna o agente testável, previsível e adequado ao escopo da V0, sem concentrar transporte HTTP, estado de sessão, análise visual e decisão final em uma única classe.
