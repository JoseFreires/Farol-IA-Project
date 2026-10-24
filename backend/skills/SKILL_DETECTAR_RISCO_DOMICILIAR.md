---
name: detectar-risco-domiciliar
description: Analisa uma imagem de ambiente residencial e produz dados estruturados sobre possíveis obstáculos, bloqueios ou alterações de acesso. Use quando o Agente Residencial precisar investigar um possível risco doméstico. Não decide fala, prioridade, cooldown ou fallback final.
version: 0.1.0
language: pt-BR
---

# Detectar Risco Domiciliar

## Quando usar

Use esta skill quando o `AgenteResidencial` precisar investigar indícios de:

- objeto possivelmente obstruindo uma área de passagem;
- objeto próximo na região central da imagem;
- alteração aparente no acesso a uma porta;
- degrau ou desnível visível;
- mudança relevante em uma área de circulação;
- possível risco doméstico claramente visível.

Não use esta skill para:

- garantir que um caminho está seguro;
- orientar travessia de rua;
- medir distâncias exatas;
- calcular prioridade final;
- decidir se o resultado deve ser falado;
- controlar cooldown ou repetição;
- produzir fallback final;
- emitir TTS;
- acessar diretamente o `SessionManager`;
- processar HTTP ou Base64.

## Limite de segurança

Esta skill produz **hipóteses estruturadas de possível risco**. Uma câmera comum e um modelo visual não garantem profundidade, distância, estabilidade do enquadramento ou ausência de elementos fora do campo visual.

Prefira termos como:

```text
POSSIVEL_OBSTACULO
POSSIVEL_BLOQUEIO
POSSIVEL_ALTERACAO_ACESSO
POSSIVEL_DESNIVEL
```

Evite termos absolutos como:

```text
CAMINHO_SEGURO
PASSAGEM_LIVRE
BLOQUEIO_CONFIRMADO
SEM_RISCO
```

## Posição na arquitetura

```text
Endpoint FastAPI valida e decodifica a imagem
  ↓
Orquestrador seleciona o Agente Residencial
  ↓
Agente Residencial chama DetectarRiscoDomiciliarSkill
  ↓
Skill usa análise atual e contexto fornecido
  ↓
ResultadoRiscoDomiciliar
  ↓
Agente converte ou agrega EventoResidencial
  ↓
ResidentialRules decide relevância e comunicação
```

## Entrada

A imagem deve chegar em `bytes`. A memória recente é fornecida pelo agente e nunca consultada diretamente pela skill.

```python
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class EntradaRiscoDomiciliar:
    imagem: bytes
    ultima_descricao: str | None = None
    objetos_atuais: tuple[dict[str, Any], ...] = ()
    objetos_recentes: tuple[dict[str, Any], ...] = ()
    indice_mudanca_visual: float | None = None
    regioes_alteradas: tuple[str, ...] = ()
```

### Validações

- `imagem` deve conter bytes não vazios;
- `indice_mudanca_visual`, quando informado, deve estar entre `0.0` e `1.0`;
- objetos e regiões podem estar vazios;
- nomes, posições e proximidades devem ser normalizados;
- a skill não deve receber `session_id`, request HTTP ou Base64.

## Enumerações recomendadas

```python
from enum import Enum


class TipoRiscoDomiciliar(str, Enum):
    POSSIVEL_OBSTACULO = "POSSIVEL_OBSTACULO"
    POSSIVEL_BLOQUEIO = "POSSIVEL_BLOQUEIO"
    POSSIVEL_ALTERACAO_ACESSO = "POSSIVEL_ALTERACAO_ACESSO"
    POSSIVEL_DESNIVEL = "POSSIVEL_DESNIVEL"
    POSSIVEL_RISCO_AMBIENTAL = "POSSIVEL_RISCO_AMBIENTAL"


class PosicaoRelativa(str, Enum):
    ESQUERDA = "ESQUERDA"
    CENTRO = "CENTRO"
    DIREITA = "DIREITA"
    SUPERIOR = "SUPERIOR"
    INFERIOR = "INFERIOR"
    INDETERMINADA = "INDETERMINADA"


class ProximidadeAproximada(str, Enum):
    MUITO_PERTO = "MUITO_PERTO"
    PERTO = "PERTO"
    MEDIA = "MEDIA"
    LONGE = "LONGE"
    INDETERMINADA = "INDETERMINADA"


class FonteRisco(str, Enum):
    ANALISE_ATUAL = "ANALISE_ATUAL"
    OBJETOS_ESTRUTURADOS = "OBJETOS_ESTRUTURADOS"
    ANALISE_COMBINADA = "ANALISE_COMBINADA"
```

## Saída

```python
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True, slots=True)
class ErroSkill:
    codigo: str
    detalhe: str | None = None
    recuperavel: bool = True


@dataclass(frozen=True, slots=True)
class RiscoDomiciliarDetectado:
    tipo: TipoRiscoDomiciliar
    objeto: str | None
    posicao: PosicaoRelativa | None
    proximidade: ProximidadeAproximada | None
    confianca: float
    descricao: str
    fonte: FonteRisco
    metadados: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class ResultadoRiscoDomiciliar:
    possui_possivel_risco: bool
    riscos: tuple[RiscoDomiciliarDetectado, ...] = ()
    confianca_geral: float | None = None
    erro: ErroSkill | None = None
```

### Códigos de erro iniciais

```text
IMAGEM_INVALIDA
IMAGEM_ESCURA
MODELO_INDISPONIVEL
TIMEOUT_MODELO
RESPOSTA_INVALIDA_MODELO
OBJETO_AMBIGUO
EVIDENCIA_INSUFICIENTE
```

`EVIDENCIA_INSUFICIENTE` pode resultar em `possui_possivel_risco=False` ou erro recuperável, conforme a estratégia definida na implementação. A ausência de risco detectado não equivale a ambiente seguro.

## Comportamento obrigatório

Siga esta ordem:

1. valide a imagem e os dados auxiliares;
2. normalize objetos, posições e proximidades;
3. analise primeiro os objetos já estruturados;
4. use mudança visual apenas como evidência complementar;
5. acione o modelo visual por client injetado quando necessário;
6. aceite somente tipos previstos no contrato;
7. valide confiança entre `0.0` e `1.0`;
8. remova detecções duplicadas;
9. retorne dados estruturados;
10. não converta a detecção em prioridade ou decisão de fala.

## Heurísticas permitidas

As heurísticas abaixo produzem somente **possíveis riscos**:

- objeto na região `CENTRO` com proximidade `PERTO` pode produzir `POSSIVEL_OBSTACULO`;
- objeto novo na região central pode produzir `POSSIVEL_BLOQUEIO` quando houver evidência complementar;
- alteração aparente junto a uma porta pode produzir `POSSIVEL_ALTERACAO_ACESSO`;
- desnível visualmente identificável pode produzir `POSSIVEL_DESNIVEL`;
- baixa confiança deve resultar em ausência de evento ou indicação de evidência insuficiente.

Os limiares de confiança devem ser configuráveis e ajustados com testes. A skill não atribui prioridade final.

## Prompt para o modelo visual

```text
Analise a imagem de um ambiente residencial procurando somente possíveis riscos domésticos claramente visíveis.

Última descrição: {ultima_descricao}
Objetos atuais: {objetos_atuais}
Objetos recentes: {objetos_recentes}
Índice de mudança visual: {indice_mudanca_visual}
Regiões alteradas: {regioes_alteradas}

Regras:
1. Tipos permitidos: POSSIVEL_OBSTACULO, POSSIVEL_BLOQUEIO, POSSIVEL_ALTERACAO_ACESSO, POSSIVEL_DESNIVEL e POSSIVEL_RISCO_AMBIENTAL.
2. Não afirme que o ambiente ou o caminho está seguro.
3. Não estime metros.
4. Use posição: ESQUERDA, CENTRO, DIREITA, SUPERIOR, INFERIOR ou INDETERMINADA.
5. Use proximidade: MUITO_PERTO, PERTO, MEDIA, LONGE ou INDETERMINADA.
6. Não invente objetos ou riscos.
7. Na dúvida, não crie um risco e reduza a confiança.
8. Descreva cada hipótese em uma frase curta.
9. Retorne somente JSON válido conforme o schema.
```

## Schema esperado do modelo

```json
{
  "possui_possivel_risco": true,
  "riscos": [
    {
      "tipo": "POSSIVEL_OBSTACULO",
      "objeto": "cadeira",
      "posicao": "CENTRO",
      "proximidade": "PERTO",
      "confianca": 0.82,
      "descricao": "Possível cadeira próxima na região central.",
      "fonte": "ANALISE_COMBINADA"
    }
  ],
  "confianca_geral": 0.82
}
```

## Exemplo sem risco identificado

```json
{
  "possui_possivel_risco": false,
  "riscos": [],
  "confianca_geral": 0.79,
  "erro": null
}
```

Esse resultado significa somente que a skill não identificou um risco com confiança suficiente. O resultado não garante segurança.

## Interface

```python
from typing import Protocol


class DetectarRiscoDomiciliarSkill(Protocol):
    async def executar(
        self,
        entrada: EntradaRiscoDomiciliar,
    ) -> ResultadoRiscoDomiciliar:
        ...
```

## Dependências

```python
class DetectarRiscoDomiciliarSkillImpl:
    def __init__(
        self,
        ollama_client,
        image_validator,
        risk_normalizer,
    ):
        self.ollama_client = ollama_client
        self.image_validator = image_validator
        self.risk_normalizer = risk_normalizer
```

Regras:

- a skill não realiza HTTP diretamente;
- `OllamaClient` encapsula URL, timeout, payload e erros de transporte;
- o normalizador valida enums, confiança e duplicidades;
- dependências devem ser substituíveis por fakes ou mocks;
- a análise determinística deve ocorrer antes da chamada ao modelo, quando possível.

## Integração com o Agente Residencial

```python
resultado = await detectar_risco_skill.executar(
    EntradaRiscoDomiciliar(
        imagem=solicitacao.imagem,
        ultima_descricao=memoria.ultima_descricao,
        objetos_atuais=tuple(objetos_atuais),
        objetos_recentes=tuple(memoria.objetos_recentes),
        indice_mudanca_visual=comparacao.indice_mudanca,
        regioes_alteradas=comparacao.regioes_alteradas,
    )
)

if resultado.erro is not None:
    # O agente consolida o erro.
    # O orquestrador coordena o fallback.
    ...
```

## Conversão para `EventoResidencial`

Cada risco pode ser convertido em evento de domínio por um mapper ou pelo agente:

```python
evento = EventoResidencial(
    tipo=TipoEventoResidencial.POSSIVEL_OBSTACULO,
    objeto="cadeira",
    posicao=PosicaoRelativa.CENTRO,
    proximidade=ProximidadeAproximada.PERTO,
    confianca=0.82,
    origem=OrigemEvento.COMBINADA,
    descricao="Possível cadeira próxima na região central.",
)
```

A skill não aplica `ResidentialRules`.

## Restrições

A skill não deve retornar:

```text
deve_falar
prioridade
cooldown_segundos
fallback
status_http
mensagem_final_do_sistema
```

A skill não garante:

- caminho livre;
- ausência de riscos;
- distância real;
- estabilidade do enquadramento;
- interpretação completa do ambiente;
- detecção de elementos fora do campo visual.

## Testes mínimos

1. detecta possível obstáculo claramente visível;
2. retorna coleção vazia quando não existe evidência suficiente;
3. não traduz ausência de detecção como segurança;
4. usa `POSSIVEL_BLOQUEIO`, nunca bloqueio confirmado;
5. trata imagem inválida;
6. trata imagem escura;
7. trata timeout e indisponibilidade do modelo;
8. trata JSON inválido do modelo;
9. valida confiança entre `0.0` e `1.0`;
10. valida índice visual entre `0.0` e `1.0`;
11. normaliza posição e proximidade;
12. remove detecções duplicadas;
13. não atribui prioridade ou cooldown;
14. não decide fala;
15. não estima metros;
16. funciona com clients simulados.

## Critérios de aceite

A skill estará apta quando:

- receber imagem em `bytes`;
- possuir entrada e saída tipadas;
- não depender de FastAPI ou `SessionManager`;
- usar clients e serviços injetados;
- não executar HTTP diretamente;
- retornar hipóteses de risco e confiança estruturadas;
- retornar erro estruturado;
- ser testável isoladamente;
- não misturar percepção com decisão de comunicação;
- integrar-se ao `AgenteResidencial` e a `EventoResidencial`;
- não produzir garantias de segurança.
