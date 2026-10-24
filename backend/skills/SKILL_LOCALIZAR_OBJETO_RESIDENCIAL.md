---
name: localizar-objeto-residencial
description: Localiza um objeto solicitado em uma imagem de ambiente residencial, usando a imagem atual e contexto recente. Retorna dados estruturados de localização, sem decidir fala, prioridade, cooldown ou fallback final.
version: 0.1.0
language: pt-BR
---

# Localizar Objeto Residencial

## Quando usar

Use esta skill quando o Agente Residencial precisar localizar um objeto específico no ambiente, por exemplo:

- "Onde está o sofá?"
- "Tem uma porta por perto?"
- "Você consegue ver a cadeira?"
- "Existe uma mesa à direita?"

Não use esta skill para:

- descrever todo o ambiente;
- afirmar que um caminho está seguro;
- calcular prioridade;
- decidir se o resultado deve ser falado;
- executar TTS;
- aplicar cooldown ou repetição;
- acessar diretamente o SessionManager;
- processar HTTP ou Base64.

## Posição na arquitetura

```text
Endpoint FastAPI valida e decodifica a imagem
  ↓
Orquestrador seleciona o Agente Residencial
  ↓
Agente Residencial chama esta skill
  ↓
Skill usa OllamaClient e/ou memória fornecida
  ↓
ResultadoLocalizarObjeto
  ↓
Agente consolida DadosAnaliseResidencial
  ↓
ResidentialRules decide a comunicação
```

## Entrada

A imagem deve chegar decodificada em `bytes`. A memória recente é fornecida pelo agente e nunca consultada diretamente pela skill.

```python
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class EntradaLocalizarObjeto:
    imagem: bytes
    objeto_alvo: str
    ultima_descricao: str | None = None
    objetos_recentes: tuple[dict[str, Any], ...] = ()
```

### Validações de entrada

- `imagem` deve conter bytes não vazios;
- `objeto_alvo` deve possuir texto não vazio após `strip()`;
- `objetos_recentes` pode ser vazio;
- nomes devem ser normalizados para comparação interna;
- a skill não deve receber `session_id`, Base64 ou objetos HTTP.

## Saída

```python
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ErroSkill:
    codigo: str
    detalhe: str | None = None
    recuperavel: bool = True


@dataclass(frozen=True, slots=True)
class ResultadoLocalizarObjeto:
    objeto_encontrado: bool
    objeto: str | None
    posicao: str | None
    proximidade: str | None
    confianca: float | None
    fonte: str
    resposta_semantica: str | None = None
    erro: ErroSkill | None = None
```

### Valores permitidos

`posicao`:

```text
ESQUERDA
CENTRO
DIREITA
INDETERMINADA
```

`proximidade`:

```text
PERTO
MEDIA
LONGE
INDETERMINADA
```

`fonte`:

```text
ANALISE_ATUAL
MEMORIA_RECENTE
ANALISE_E_MEMORIA
SEM_FONTE_CONFIAVEL
```

### Códigos de erro iniciais

```text
IMAGEM_INVALIDA
IMAGEM_ESCURA
MODELO_INDISPONIVEL
TIMEOUT_MODELO
RESPOSTA_INVALIDA_MODELO
OBJETO_NAO_IDENTIFICADO
OBJETO_ALVO_INVALIDO
```

## Comportamento

Siga esta ordem:

1. valide `objeto_alvo` e `imagem`;
2. normalize o nome do objeto procurado;
3. verifique se há evidência útil em `objetos_recentes`;
4. analise a imagem atual por meio do client injetado;
5. confronte o resultado atual com a memória fornecida;
6. escolha a fonte correspondente;
7. retorne `ResultadoLocalizarObjeto`;
8. nunca transforme o resultado em decisão de fala.

### Uso da memória

- A imagem atual deve ter precedência sobre a memória recente.
- Se o objeto aparecer somente na memória, use `MEMORIA_RECENTE` e linguagem de incerteza.
- Não afirme que o objeto continua no mesmo local sem confirmação atual.
- Se imagem e memória forem coerentes, use `ANALISE_E_MEMORIA`.
- Se não houver evidência suficiente, use `SEM_FONTE_CONFIAVEL`.

## Prompt para o modelo visual

```text
Localize o objeto solicitado na imagem de um ambiente residencial.

Objeto procurado: {objeto_alvo}
Descrição recente: {ultima_descricao}
Objetos recentes: {objetos_recentes}

Regras:
1. Use a imagem atual como principal fonte.
2. Não invente objetos.
3. Informe se o objeto foi encontrado.
4. Quando encontrado, indique posição: ESQUERDA, CENTRO, DIREITA ou INDETERMINADA.
5. Informe proximidade somente quando houver evidência: PERTO, MEDIA, LONGE ou INDETERMINADA.
6. Não estime metros.
7. Não declare que o caminho está seguro.
8. Se não houver evidência suficiente, informe que não foi possível confirmar.
9. Retorne somente JSON válido conforme o schema.
```

## Schema esperado do modelo

```json
{
  "objeto_encontrado": true,
  "objeto": "sofa",
  "posicao": "CENTRO",
  "proximidade": "MEDIA",
  "confianca": 0.88
}
```

## Exemplo de sucesso

```json
{
  "objeto_encontrado": true,
  "objeto": "sofa",
  "posicao": "CENTRO",
  "proximidade": "MEDIA",
  "confianca": 0.88,
  "fonte": "ANALISE_ATUAL",
  "resposta_semantica": "O sofá foi identificado na região central da imagem.",
  "erro": null
}
```

## Exemplo sem confirmação

```json
{
  "objeto_encontrado": false,
  "objeto": "chaves",
  "posicao": null,
  "proximidade": null,
  "confianca": 0.31,
  "fonte": "SEM_FONTE_CONFIAVEL",
  "resposta_semantica": "Não foi possível localizar as chaves nesta imagem.",
  "erro": null
}
```

## Interface da skill

```python
from typing import Protocol


class LocalizarObjetoSkill(Protocol):
    async def executar(
        self,
        entrada: EntradaLocalizarObjeto,
    ) -> ResultadoLocalizarObjeto:
        ...
```

## Dependências

A implementação pode receber por injeção:

```python
class LocalizarObjetoSkillImpl:
    def __init__(self, ollama_client, image_validator):
        self.ollama_client = ollama_client
        self.image_validator = image_validator
```

Regras:

- a skill não realiza HTTP diretamente;
- o `OllamaClient` encapsula URL, timeout, payload e erros de transporte;
- o validador de imagem verifica bytes, formato e condições mínimas;
- clients devem ser substituíveis por fakes ou mocks em testes.

## Integração com o Agente Residencial

```python
resultado = await localizar_objeto_skill.executar(
    EntradaLocalizarObjeto(
        imagem=solicitacao.imagem,
        objeto_alvo=objeto_alvo,
        ultima_descricao=memoria.ultima_descricao,
        objetos_recentes=tuple(memoria.objetos_recentes),
    )
)

if resultado.erro is not None:
    # O agente consolida o erro. O orquestrador coordena o fallback.
    ...

# O agente inclui a resposta em DadosAnaliseResidencial.
```

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

- distância real;
- permanência do objeto no local;
- caminho livre;
- ausência de riscos;
- localização fora do campo visível.

## Testes mínimos

1. localiza objeto claramente visível;
2. retorna `objeto_encontrado=False` quando o objeto não aparece;
3. usa `ANALISE_ATUAL` quando a imagem confirma o objeto;
4. usa `MEMORIA_RECENTE` com linguagem de incerteza;
5. usa `ANALISE_E_MEMORIA` quando as fontes concordam;
6. rejeita `objeto_alvo` vazio;
7. trata imagem inválida;
8. trata timeout;
9. trata indisponibilidade do modelo;
10. trata JSON inválido do modelo;
11. valida confiança entre `0.0` e `1.0`;
12. normaliza posição e proximidade;
13. não retorna decisão de fala;
14. não afirma caminho seguro;
15. funciona com `OllamaClient` simulado.

## Critérios de aceite

A skill estará apta quando:

- receber imagem em `bytes`;
- possuir entrada e saída tipadas;
- não depender de FastAPI ou SessionManager;
- usar client injetado para o modelo visual;
- não realizar HTTP diretamente;
- retornar fonte e confiança;
- retornar erro estruturado;
- ser testável isoladamente;
- não misturar percepção com decisão de comunicação;
- integrar-se ao `AgenteResidencial`.
