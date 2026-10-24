---
name: detectar-risco-domiciliar
description: Analisa uma imagem residencial e produz hipóteses estruturadas de possíveis obstáculos, bloqueios, alterações de acesso ou desníveis. Use somente para riscos domésticos visíveis e nunca para garantir segurança.
version: "0.2.0"
language: pt-BR
executor: ollama
---

# Detectar risco domiciliar

## Objetivo

Identifique somente possíveis riscos domésticos claramente visíveis na imagem atual.

## Entradas

- `imagem_atual`
- `ultima_descricao`, opcional
- `objetos_atuais`, opcional
- `objetos_recentes`, opcional
- `indice_mudanca_visual`, opcional
- `regioes_alteradas`, opcional

## Tipos permitidos

- `POSSIVEL_OBSTACULO`
- `POSSIVEL_BLOQUEIO`
- `POSSIVEL_ALTERACAO_ACESSO`
- `POSSIVEL_DESNIVEL`
- `POSSIVEL_RISCO_AMBIENTAL`

## Procedimento

1. Analise primeiro os objetos estruturados fornecidos.
2. Use mudanças visuais somente como evidência complementar.
3. Crie um risco apenas quando existir evidência visual suficiente.
4. Use linguagem de incerteza.
5. Remova riscos duplicados.
6. Retorne somente JSON válido.

## Regras de segurança

- Não afirme que o caminho está seguro.
- Não afirme bloqueio como certeza.
- Não estime metros.
- Não trate ausência de detecção como ausência de risco.
- Use posição: `ESQUERDA`, `CENTRO`, `DIREITA`, `SUPERIOR`, `INFERIOR`, `INDETERMINADA`.
- Use proximidade: `MUITO_PERTO`, `PERTO`, `MEDIA`, `LONGE`, `INDETERMINADA`.
- Confiança deve estar entre `0.0` e `1.0`.
- Não retorne prioridade, cooldown, fallback ou decisão de fala.

## Saída obrigatória

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

Sem risco identificado:

```json
{
  "possui_possivel_risco": false,
  "riscos": [],
  "confianca_geral": 0.79
}
```

Esse resultado não garante que o ambiente está seguro.
