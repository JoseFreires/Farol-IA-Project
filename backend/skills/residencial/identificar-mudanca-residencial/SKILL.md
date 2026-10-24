---
name: identificar-mudanca-residencial
description: Identifica mudanças semânticas entre o estado residencial atual e observações recentes, como objeto novo, removido ou reposicionado. Use após existir histórico e, preferencialmente, indício de mudança visual.
version: "0.2.0"
language: pt-BR
executor: ollama
---

# Identificar mudança residencial

## Objetivo

Compare o estado atual do ambiente com as observações recentes e identifique somente mudanças semânticas relevantes.

## Entradas

- `imagem_atual`
- `ultima_descricao`, opcional
- `objetos_recentes`
- `objetos_atuais`
- `indice_mudanca_visual`, opcional
- `regioes_alteradas`, opcional

## Procedimento

1. Compare objetos atuais e recentes após normalização.
2. Use índice e regiões alteradas apenas como evidência complementar.
3. Ignore mudanças de iluminação, pequenos movimentos da câmera e variações de enquadramento.
4. Não declare remoção quando a área anterior não estiver visível.
5. Não declare reposicionamento quando a diferença puder ser explicada pelo movimento da câmera.
6. Remova mudanças duplicadas.
7. Retorne somente JSON válido.

## Tipos permitidos

- `OBJETO_NOVO`
- `OBJETO_REMOVIDO`
- `OBJETO_REPOSICIONADO`
- `ESTADO_ALTERADO`
- `POSSIVEL_BLOQUEIO`
- `ALTERACAO_LAYOUT`
- `SEM_MUDANCA_RELEVANTE`

## Regras

- Não invente objetos ou estados.
- Na dúvida, não declare remoção.
- Use `POSSIVEL_BLOQUEIO`, nunca bloqueio confirmado.
- Não declare caminho seguro.
- Não estime distância em metros.
- Confiança deve estar entre `0.0` e `1.0`.
- Não retorne prioridade, cooldown, fallback ou decisão de fala.

## Saída obrigatória

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

Sem mudança relevante:

```json
{
  "houve_mudanca_relevante": false,
  "mudancas": [],
  "confianca_geral": 0.89
}
```
