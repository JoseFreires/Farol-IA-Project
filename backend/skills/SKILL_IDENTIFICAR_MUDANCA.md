---
name: identificar-mudanca-residencial
description: Compara o estado atual de um ambiente residencial com observações anteriores e produz dados estruturados sobre objetos novos, removidos, reposicionados ou alterações relevantes. Não decide fala, prioridade, cooldown ou fallback final.
version: 0.1.0
language: pt-BR
---

# Identificar Mudança Residencial

## Quando usar

Use esta skill quando o `AgenteResidencial` precisar comparar o estado atual do ambiente com observações recentes para identificar mudanças semânticas, por exemplo:

- objeto novo no ambiente;
- objeto removido;
- alteração aproximada de posição;
- porta aparentemente aberta ou fechada em relação à observação anterior;
- mudança relevante no layout visível;
- possível bloqueio novo na região central do frame.

Não use esta skill para:

- comparar somente diferenças de pixels entre frames;
- descrever integralmente o ambiente;
- garantir que um caminho está seguro;
- decidir se o resultado será falado;
- calcular prioridade ou cooldown;
- executar fallback final ou TTS;
- acessar diretamente o `SessionManager`;
- receber HTTP ou Base64.

## Posição na arquitetura

```text
Endpoint FastAPI valida e decodifica a imagem
  ↓
Orquestrador seleciona o Agente Residencial
  ↓
SessionManager fornece a memória curta ao orquestrador
  ↓
Agente Residencial chama IdentificarMudancaSkill
  ↓
Skill compara análise atual e memória fornecida
  ↓
ResultadoIdentificacaoMudanca
  ↓
Agente consolida DadosAnaliseResidencial
  ↓
ResidentialRules decide relevância e comunicação
```

## Diferença para `CompararFramesSkill`

```text
CompararFramesSkill
→ identifica mudança visual em pixels ou regiões

IdentificarMudancaSkill
→ identifica mudança semântica em objetos ou estado do ambiente
```

A skill pode receber o resultado de `CompararFramesSkill` como pista técnica, mas não deve depender exclusivamente de diferenças de pixels para afirmar qual objeto mudou.

## Entrada

A imagem deve chegar decodificada em `bytes`. A memória recente deve ser fornecida pelo agente.

```python
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class EntradaIdentificarMudanca:
    imagem: bytes
    ultima_descricao: str | None = None
    objetos_recentes: tuple[dict[str, Any], ...] = ()
    objetos_atuais: tuple[dict[str, Any], ...] = ()
    indice_mudanca_visual: float | None = None
    regioes_alteradas: tuple[str, ...] = ()
```

### Validações de entrada

- `imagem` deve possuir bytes não vazios;
- `indice_mudanca_visual`, quando informado, deve estar entre `0.0` e `1.0`;
- `objetos_recentes` e `objetos_atuais` podem ser vazios;
- regiões devem ser normalizadas;
- a skill não deve receber `session_id`, objetos HTTP ou Base64;
- a ausência de histórico deve resultar em erro recuperável ou análise sem comparação, conforme a implementação.

## Enumerações recomendadas

```python
from enum import Enum


class TipoMudancaResidencial(str, Enum):
    OBJETO_NOVO = "OBJETO_NOVO"
    OBJETO_REMOVIDO = "OBJETO_REMOVIDO"
    OBJETO_REPOSICIONADO = "OBJETO_REPOSICIONADO"
    ESTADO_ALTERADO = "ESTADO_ALTERADO"
    POSSIVEL_BLOQUEIO = "POSSIVEL_BLOQUEIO"
    ALTERACAO_LAYOUT = "ALTERACAO_LAYOUT"
    SEM_MUDANCA_RELEVANTE = "SEM_MUDANCA_RELEVANTE"


class FonteMudanca(str, Enum):
    ANALISE_SEMANTICA = "ANALISE_SEMANTICA"
    COMPARACAO_OBJETOS = "COMPARACAO_OBJETOS"
    ANALISE_E_COMPARACAO = "ANALISE_E_COMPARACAO"
```

Evite `BLOQUEIO_CAMINHO` como certeza absoluta. Prefira `POSSIVEL_BLOQUEIO`, pois a câmera e o modelo não garantem interpretação espacial completa.

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
class ItemAlterado:
    nome: str | None
    posicao_anterior: str | None
    posicao_atual: str | None
    confianca: float


@dataclass(frozen=True, slots=True)
class MudancaResidencialDetectada:
    tipo: TipoMudancaResidencial
    descricao: str
    objetos_alterados: tuple[ItemAlterado, ...]
    confianca: float
    fonte: FonteMudanca
    metadados: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class ResultadoIdentificacaoMudanca:
    houve_mudanca_relevante: bool
    mudancas: tuple[MudancaResidencialDetectada, ...] = ()
    confianca_geral: float | None = None
    erro: ErroSkill | None = None
```

### Códigos de erro iniciais

```text
IMAGEM_INVALIDA
IMAGEM_ESCURA
HISTORICO_INSUFICIENTE
MODELO_INDISPONIVEL
TIMEOUT_MODELO
RESPOSTA_INVALIDA_MODELO
OBJETOS_NAO_COMPARAVEIS
```

## Comportamento obrigatório

Siga esta ordem:

1. valide imagem, índice e coleções recebidas;
2. verifique se existe histórico suficiente;
3. normalize nomes e posições dos objetos;
4. compare `objetos_atuais` com `objetos_recentes`;
5. use o índice e as regiões visuais somente como evidência complementar;
6. acione o modelo visual por client injetado quando a análise semântica for necessária;
7. consolide mudanças compatíveis entre as fontes;
8. remova duplicidades;
9. retorne resultado estruturado;
10. não transforme mudanças em decisão de fala.

## Regras de comparação

### Objeto novo

Um objeto pode ser classificado como `OBJETO_NOVO` quando:

- aparece na análise atual;
- não existe na coleção recente após normalização;
- possui confiança mínima técnica configurada;
- existe evidência visual ou semântica suficiente.

### Objeto removido

Um objeto pode ser classificado como `OBJETO_REMOVIDO` quando:

- existia anteriormente;
- não foi encontrado na análise atual;
- a área correspondente está suficientemente visível;
- a ausência não decorre apenas de enquadramento diferente.

Na dúvida, não declare remoção.

### Objeto reposicionado

Um objeto pode ser classificado como `OBJETO_REPOSICIONADO` quando:

- o mesmo objeto existe nas duas análises;
- a posição relativa mudou de forma relevante;
- a diferença não parece ser apenas movimento da câmera.

### Possível bloqueio

Use `POSSIVEL_BLOQUEIO` somente quando um objeto novo ou reposicionado estiver na região central e houver evidência qualitativa de proximidade. A skill não deve declarar caminho bloqueado ou inseguro como certeza.

## Prompt para o modelo visual

```text
Compare a imagem atual com as observações recentes fornecidas.

Última descrição: {ultima_descricao}
Objetos recentes: {objetos_recentes}
Objetos atuais: {objetos_atuais}
Índice de mudança visual: {indice_mudanca_visual}
Regiões alteradas: {regioes_alteradas}

Regras:
1. Identifique somente mudanças relevantes no ambiente residencial.
2. Ignore pequenas variações de iluminação, câmera ou enquadramento.
3. Tipos permitidos: OBJETO_NOVO, OBJETO_REMOVIDO, OBJETO_REPOSICIONADO, ESTADO_ALTERADO, POSSIVEL_BLOQUEIO, ALTERACAO_LAYOUT ou SEM_MUDANCA_RELEVANTE.
4. Não declare remoção se a área não estiver suficientemente visível.
5. Não declare que o caminho está seguro ou bloqueado com certeza.
6. Descreva cada mudança em uma frase curta.
7. Não invente objetos ou estados.
8. Retorne somente JSON válido conforme o schema fornecido.
```

## Schema esperado do modelo

```json
{
  "houve_mudanca_relevante": true,
  "mudancas": [
    {
      "tipo": "OBJETO_NOVO",
      "descricao": "Uma cadeira foi identificada na região central.",
      "objetos_alterados": [
        {
          "nome": "cadeira",
          "posicao_anterior": null,
          "posicao_atual": "CENTRO",
          "confianca": 0.82
        }
      ],
      "confianca": 0.82,
      "fonte": "ANALISE_E_COMPARACAO"
    }
  ],
  "confianca_geral": 0.82
}
```

## Exemplo sem mudança relevante

```json
{
  "houve_mudanca_relevante": false,
  "mudancas": [],
  "confianca_geral": 0.89,
  "erro": null
}
```

## Interface da skill

```python
from typing import Protocol


class IdentificarMudancaSkill(Protocol):
    async def executar(
        self,
        entrada: EntradaIdentificarMudanca,
    ) -> ResultadoIdentificacaoMudanca:
        ...
```

## Dependências

```python
class IdentificarMudancaSkillImpl:
    def __init__(
        self,
        ollama_client,
        image_validator,
        object_normalizer,
    ):
        self.ollama_client = ollama_client
        self.image_validator = image_validator
        self.object_normalizer = object_normalizer
```

Regras:

- a skill não realiza HTTP diretamente;
- `OllamaClient` encapsula transporte, timeout e resposta do modelo;
- o normalizador padroniza nomes e posições;
- dependências devem ser substituíveis por fakes ou mocks;
- a análise determinística de objetos deve ser executada antes de chamar o modelo, quando possível.

## Integração com o Agente Residencial

```python
resultado = await identificar_mudanca_skill.executar(
    EntradaIdentificarMudanca(
        imagem=solicitacao.imagem,
        ultima_descricao=memoria.ultima_descricao,
        objetos_recentes=tuple(memoria.objetos_recentes),
        objetos_atuais=tuple(objetos_atuais),
        indice_mudanca_visual=comparacao.indice_mudanca,
        regioes_alteradas=comparacao.regioes_alteradas,
    )
)

if resultado.erro is not None:
    # O agente consolida o erro.
    # O orquestrador coordena o fallback.
    ...

# As mudanças são convertidas ou agregadas em EventoResidencial.
```

## Conversão para `EventoResidencial`

Cada mudança pode originar um evento de domínio:

```python
evento = EventoResidencial(
    tipo=TipoEventoResidencial.OBJETO_NOVO,
    objeto="cadeira",
    posicao=PosicaoRelativa.CENTRO,
    proximidade=ProximidadeAproximada.INDETERMINADA,
    confianca=0.82,
    origem=OrigemEvento.COMBINADA,
    descricao="Uma cadeira foi identificada na região central.",
)
```

A conversão pode ficar no agente ou em um mapper específico. A skill não deve aplicar `ResidentialRules`.

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

- que a câmera manteve o mesmo ponto de vista;
- que um objeto ausente foi removido;
- que um objeto está bloqueando totalmente a passagem;
- que o ambiente está seguro;
- medição real de distância.

## Testes mínimos

1. detecta objeto novo com evidência suficiente;
2. detecta ausência de mudança relevante;
3. detecta reposicionamento relevante;
4. não declara remoção quando o enquadramento mudou;
5. produz `POSSIVEL_BLOQUEIO`, nunca garantia de bloqueio;
6. trata histórico insuficiente como erro recuperável;
7. trata imagem inválida;
8. trata timeout e indisponibilidade do modelo;
9. trata JSON inválido do modelo;
10. valida confiança entre `0.0` e `1.0`;
11. valida índice visual entre `0.0` e `1.0`;
12. normaliza objetos e posições;
13. remove mudanças duplicadas;
14. não atribui prioridade ou cooldown;
15. não decide fala;
16. funciona com clients simulados.

## Critérios de aceite

A skill estará apta quando:

- receber imagem em `bytes`;
- possuir entrada e saída tipadas;
- não depender de FastAPI ou `SessionManager`;
- usar clients e serviços injetados;
- não executar HTTP diretamente;
- distinguir mudança visual de mudança semântica;
- retornar mudanças e confiança estruturadas;
- retornar erro estruturado;
- ser testável isoladamente;
- não misturar percepção com decisão de comunicação;
- integrar-se ao `AgenteResidencial` e a `EventoResidencial`.
