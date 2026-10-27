---
name: identify-change
description: Identifica mudanças semânticas estritas entre o estado atual da cena e observações recentes. Rejeita alterações se houver mudança total de contexto espacial.
version: "0.3.0"
language: pt-BR
executor: ollama
---

# Identificar mudança na cena com rigor espacial

## Objetivo

Compare o estado atual do ambiente com as observações recentes e identifique apenas mudanças semânticas reais e relevantes, garantindo que o espaço físico avaliado é o mesmo.

## Entradas

- `imagem_atual`
- `ultima_descricao`, opcional
- `objetos_recentes`
- `objetos_atuais`
- `indice_mudanca_visual`, opcional
- `regioes_alteradas`, opcional

## Procedimento Crítico de Continuidade

1. **Verificação de Mudança de Divisão/Contexto:** Antes de comparar objetos, verifique se a tipologia do ambiente mudou drasticamente entre a imagem anterior e a atual (ex: transição de uma cozinha para uma casa de banho). Se o espaço físico for manifestamente diferente, **interrompa a análise de remoção** e retorne obrigatoriamente `SEM_MUDANCA_RELEVANTE` (ou declare uma alteração global de ambiente).
2. Quando duas imagens válidas do mesmo espaço forem anexadas, compare a primeira (imagem anterior) com a segunda (imagem atual)[cite: 6, 7].
3. Ignore rigorosamente mudanças de iluminação, pequenos movimentos da câmara e variações de enquadramento[cite: 6, 7].
4. **Proibição Absoluta de Falsas Remoções:** Nunca declare `OBJETO_REMOVIDO` de elementos grandes, estruturais ou eletrodomésticos importantes (como banheiras, frigoríficos, móveis fixos) a menos que estivessem explicitamente descritos na `ultima_descricao` e a área exata esteja perfeitamente visível na imagem atual.
5. Na dúvida sobre a continuidade do espaço ou sobre a remoção de um objeto, opte sempre por retornar `SEM_MUDANCA_RELEvanTE`[cite: 6, 7].
6. Retorne estritamente JSON válido, sem texto adicional[cite: 6, 7].

## Tipos permitidos

- `OBJETO_NOVO`
- `OBJETO_REMOVIDO` (Apenas com evidência visual irrefutável e mesma divisão)
- `OBJETO_REPOSICIONADO`
- `ESTADO_ALTERADO`
- `POSSIVEL_BLOQUEIO`
- `ALTERACAO_LAYOUT`
- `SEM_MUDANCA_RELEVANTE`

## Regras de Ouro

- **Nunca alucine objetos** que nunca foram mencionados no histórico ou que pertencem a outra tipologia de divisão[cite: 6, 7].
- Se o contexto visual mudou por completo, o comportamento correto é assumir ausência de comparabilidade e retornar `SEM_MUDANCA_RELEVANTE`.
- Use `POSSIVEL_BLOQUEIO`, nunca bloqueio confirmado[cite: 6, 7].
- Não declare caminho seguro nem estime distâncias em metros[cite: 6, 7].
- O nível de confiança deve refletir a certeza absoluta da alteração (entre `0.0` e `1.0`)[cite: 6, 7].

## Saída obrigatória

Exemplo de mudança real confirmada no mesmo espaço:
```json
{
  "houve_mudanca_relevante": true,
  "mudancas": [
    {
      "tipo": "OBJETO_NOVO",
      "descricao": "Uma cadeira foi colocada na zona central.",
      "objetos_alterados": [
        {
          "nome": "cadeira",
          "posicao_anterior": null,
          "posicao_atual": "CENTRO",
          "confianca": 0.85
        }
      ],
      "confianca": 0.85,
      "fonte": "ANALISE_E_COMPARACAO"
    }
  ],
  "confianca_geral": 0.85
}