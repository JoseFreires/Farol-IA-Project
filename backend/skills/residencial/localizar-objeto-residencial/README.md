# Localizar Objeto Residencial

## Finalidade

Documentação técnica da skill `localizar-objeto-residencial`. O arquivo `SKILL.md` contém somente as instruções carregadas em runtime e enviadas ao modelo.

## Integração

```text
Agente Residencial
  -> SkillRegistry
  -> SKILL.md
  -> OllamaClient
  -> ResultadoLocalizarObjeto
  -> DadosAnaliseResidencial
  -> ResidentialRules
```

## Contrato de entrada

```python
@dataclass(frozen=True, slots=True)
class EntradaLocalizarObjeto:
    imagem: bytes
    objeto_alvo: str
    ultima_descricao: str | None = None
    objetos_recentes: tuple[dict, ...] = ()
```

## Contrato de saída

```python
@dataclass(frozen=True, slots=True)
class ResultadoLocalizarObjeto:
    objeto_encontrado: bool
    objeto: str | None
    posicao: str | None
    proximidade: str | None
    confianca: float | None
    fonte: str
    resposta_semantica: str | None = None
```

## Responsabilidades do runtime

- fornecer imagem em `bytes`;
- carregar e validar o frontmatter;
- injetar as entradas no prompt;
- enviar imagem, instruções e JSON Schema ao Ollama;
- validar a saída estruturada;
- converter falhas de transporte em erros internos.

## Fora do escopo

- HTTP e Base64;
- acesso direto ao SessionManager;
- decisão de fala;
- prioridade e cooldown;
- TTS;
- garantia de distância ou permanência do objeto.

## Testes mínimos

- objeto claramente visível;
- objeto ausente;
- uso correto da fonte;
- objeto alvo vazio;
- imagem inválida;
- timeout do modelo;
- JSON inválido;
- confiança fora do intervalo;
- saída sem campos de decisão.
