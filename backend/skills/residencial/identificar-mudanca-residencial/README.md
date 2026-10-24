# Identificar Mudança Residencial

## Finalidade

Documentação técnica da skill `identificar-mudanca-residencial`. O `SKILL.md` contém as instruções enxutas carregadas em runtime.

## Diferença para comparação de frames

```text
CompararFramesSkill -> mudança visual em pixels/regiões
IdentificarMudanca  -> mudança semântica em objetos/estado
```

## Integração

```text
CompararFramesSkill
  -> Agente Residencial
  -> identificar-mudanca-residencial/SKILL.md
  -> OllamaClient
  -> ResultadoIdentificacaoMudanca
  -> EventoResidencial
  -> ResidentialRules
```

## Contrato de entrada

```python
@dataclass(frozen=True, slots=True)
class EntradaIdentificarMudanca:
    imagem: bytes
    ultima_descricao: str | None = None
    objetos_recentes: tuple[dict, ...] = ()
    objetos_atuais: tuple[dict, ...] = ()
    indice_mudanca_visual: float | None = None
    regioes_alteradas: tuple[str, ...] = ()
```

## Contrato de saída

```python
@dataclass(frozen=True, slots=True)
class ResultadoIdentificacaoMudanca:
    houve_mudanca_relevante: bool
    mudancas: tuple
    confianca_geral: float | None = None
```

## Responsabilidades do runtime

- fornecer a memória sem permitir acesso direto ao SessionManager;
- validar índice de mudança entre `0.0` e `1.0`;
- carregar a skill;
- chamar o Ollama com JSON Schema;
- normalizar tipos, fontes e posições;
- mapear mudanças para EventoResidencial.

## Fora do escopo

- comparação bruta de pixels;
- decisão de fala;
- prioridade e cooldown;
- garantia de remoção, bloqueio ou segurança.

## Testes mínimos

- objeto novo;
- ausência de mudança;
- reposicionamento relevante;
- enquadramento diferente não deve gerar remoção;
- histórico insuficiente;
- JSON inválido;
- deduplicação;
- confiança inválida;
- saída sem decisão de comunicação.
