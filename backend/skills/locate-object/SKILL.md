---
name: locate-object
description: Localiza um objeto solicitado em uma imagem. Retorna localização estruturada e confiança, sem decidir fala ou prioridade.
version: "0.2.0"
language: pt-BR
executor: ollama
---

# Localizar objeto

## Objetivo

Localize o objeto solicitado usando a imagem atual como fonte principal e o contexto recente apenas como apoio.

## Entradas

- `objeto_alvo`
- `imagem_atual`
- `ultima_descricao`, opcional
- `objetos_recentes`, opcional

## Procedimento

1. Valide se `objeto_alvo` está preenchido.
2. Procure o objeto na imagem atual.
3. Use a memória somente como evidência complementar.
4. Se a imagem e a memória concordarem, use `ANALISE_E_MEMORIA`.
5. Se houver evidência apenas na memória, use `MEMORIA_RECENTE` e linguagem de incerteza.
6. Se não houver evidência suficiente, use `SEM_FONTE_CONFIAVEL`.
7. Retorne somente JSON válido.

## Regras

- Não invente objetos.
- Não estime distância em metros.
- Não afirme que o objeto permanece no local sem confirmação atual.
- Não declare caminho livre ou seguro.
- Posições permitidas: `ESQUERDA`, `CENTRO`, `DIREITA`, `INDETERMINADA`.
- Proximidades permitidas: `PERTO`, `MEDIA`, `LONGE`, `INDETERMINADA`.
- Fontes permitidas: `ANALISE_ATUAL`, `MEMORIA_RECENTE`, `ANALISE_E_MEMORIA`, `SEM_FONTE_CONFIAVEL`.
- Confiança deve estar entre `0.0` e `1.0`.
- Não retorne prioridade, cooldown, fallback ou decisão de fala.

## Saída obrigatória

```json
{
  "objeto_encontrado": true,
  "objeto": "sofa",
  "posicao": "CENTRO",
  "proximidade": "MEDIA",
  "confianca": 0.88,
  "fonte": "ANALISE_ATUAL",
  "resposta_semantica": "O sofá foi identificado na região central da imagem."
}
```

Quando não for possível confirmar:

```json
{
  "objeto_encontrado": false,
  "objeto": "chaves",
  "posicao": null,
  "proximidade": null,
  "confianca": 0.31,
  "fonte": "SEM_FONTE_CONFIAVEL",
  "resposta_semantica": "Não foi possível localizar as chaves nesta imagem."
}
```
