# Detectar Risco Domiciliar

## Finalidade

Documentação técnica da skill `detectar-risco-domiciliar`. O `SKILL.md` contém apenas as instruções de runtime enviadas ao modelo.

## Integração

```text
Agente Residencial
  -> detectar-risco-domiciliar/SKILL.md
  -> OllamaClient
  -> ResultadoRiscoDomiciliar
  -> EventoResidencial
  -> ResidentialRules
```

## Contrato de entrada

```python
@dataclass(frozen=True, slots=True)
class EntradaRiscoDomiciliar:
    imagem: bytes
    ultima_descricao: str | None = None
    objetos_atuais: tuple[dict, ...] = ()
    objetos_recentes: tuple[dict, ...] = ()
    indice_mudanca_visual: float | None = None
    regioes_alteradas: tuple[str, ...] = ()
```

## Contrato de saída

```python
@dataclass(frozen=True, slots=True)
class ResultadoRiscoDomiciliar:
    possui_possivel_risco: bool
    riscos: tuple
    confianca_geral: float | None = None
```

## Responsabilidades do runtime

- fornecer imagem em `bytes`;
- carregar e validar a skill;
- fornecer contexto recente sem acesso direto ao SessionManager;
- chamar Ollama com schema estruturado;
- validar tipos, posição, proximidade e confiança;
- mapear resultados para EventoResidencial.

## Fora do escopo

- garantia de caminho livre;
- distância exata;
- decisão de fala;
- prioridade, repetição e cooldown;
- fallback final;
- travessia de rua.

## Testes mínimos

- possível obstáculo visível;
- ausência de evidência;
- ausência de detecção não significa segurança;
- imagem escura;
- JSON inválido;
- confiança inválida;
- normalização e deduplicação;
- saída sem prioridade ou decisão de fala.
