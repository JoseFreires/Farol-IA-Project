---
name: identify-change
description: Compara duas imagens do ambiente e identifica mudanças semânticas reais.
version: "0.6.0"
language: pt-BR
executor: ollama
model: qwen2.5vl:7b
---

# Identificar mudança na cena

## Entradas

- Imagem 1: estado anterior.
- Imagem 2: estado atual.
- `ultima_descricao` e `objetos_recentes`: contexto auxiliar; as imagens prevalecem.

## Procedimento

1. Faça um inventário independente da Imagem 1 e depois da Imagem 2. Conte todas as instâncias visíveis de cada tipo de objeto; não use `ultima_descricao` como contagem visual.
2. Confira elementos fixos e o enquadramento. Compare somente áreas da cena que possam ser reconhecidas nas duas imagens.
3. Associe os mesmos objetos pela aparência e pela posição relativa. Mudança de zona, zoom ou recorte não transforma um objeto existente em novo.
4. Antes de classificar, compare a quantidade anterior e atual de cada tipo. Se há mais no estado anterior, a diferença é remoção; se há mais no atual, é objeto novo. A lista `mudancas` deve representar a diferença de quantidade inteira, sem omitir exemplares nem inventar quantidade.
5. Só reporte `OBJETO_NOVO` se a imagem anterior mostrar claramente a área onde o item poderia estar e confirmar sua ausência. Só reporte `OBJETO_REMOVIDO` se a área correspondente continuar visível na imagem atual. Não deduza remoção de objetos cortados pelo enquadramento.
6. Se a diferença de quantidade estiver clara, mas não for possível identificar individualmente cada exemplar, produza uma mudança com o nome no plural e informe o total na descrição (por exemplo, "Dois copos de cerveja não aparecem mais"). Não reduza uma diferença de dois ou mais para "um copo".
7. Descarte diferenças de iluminação, sombra, reflexo e cor. Se não for possível distinguir mudança real de alteração de enquadramento, não reporte a mudança.

Nunca invente objetos ou mudanças. Não declare caminho seguro nem estime distâncias. Se o espaço for claramente outro e não houver elementos fixos em comum, retorne sem mudanças.

## Saída

Retorne somente JSON válido, sem texto adicional:

```json
{
  "houve_mudanca_relevante": true,
  "mudancas": [
    {
      "tipo": "OBJETO_REMOVIDO",
      "descricao": "Dois copos de cerveja que estavam sobre a mesa não aparecem mais.",
      "objeto": "copos de cerveja",
      "confianca": 0.85
    }
  ],
  "confianca_geral": 0.85
}
```

Tipos permitidos: `OBJETO_NOVO`, `OBJETO_REMOVIDO`, `OBJETO_MOVIDO`, `OBJETO_REPOSICIONADO`, `ESTADO_ALTERADO`, `POSSIVEL_BLOQUEIO`, `ALTERACAO_LAYOUT`.

Se não houver mudança confirmável, retorne `"houve_mudanca_relevante": false`, `"mudancas": []` e uma `confianca_geral` entre 0 e 1. Para mudanças reportadas, a confiança deve ser de pelo menos 0.5 e refletir a evidência visual.
