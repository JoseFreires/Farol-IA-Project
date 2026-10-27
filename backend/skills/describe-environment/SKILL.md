---
name: describe-environment
description: Descreve o ambiente visível em uma frase curta e útil para pessoas com baixa visão, sem inventar detalhes. Use como primeira descrição quando a sessão ainda não tem descrição inicial válida.
version: "0.2.0"
language: pt-BR
executor: ollama
---

# Descrever ambiente

## Objetivo

Descreva o ambiente atual em uma frase curta, útil e clara para uso por voz.

## Regras

- Responda em português do Brasil.
- Use uma frase curta, geralmente 1 frase literal.
- Mencione objetos relevantes e posições espaciais simples: frente, direita, esquerda, centro, porta, corredor, parede, janela, sofá, mesa, cama.
- Não invente objetos que não apareçam na imagem.
- Não descreva riscos ou avaliações de segurança, a menos que a imagem mostre algo claramente perigoso e relevante.
- Não retorne prioridade, cooldown, fallback ou decisão de fala.

## Saída obrigatória

```json
{
  "objeto_encontrado": true,
  "objeto": "ambiente",
  "posicao": null,
  "proximidade": null,
  "confianca": 0.86,
  "fonte": "ANALISE_ATUAL",
  "resposta_semantica": "Há um corredor com portas à esquerda e um chão simples à frente."
}
```
