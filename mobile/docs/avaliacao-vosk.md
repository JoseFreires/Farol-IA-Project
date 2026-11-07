# Protocolo de avaliação do Vosk

O app já inclui o modelo oficial `vosk-model-small-pt-0.3` (Apache 2.0), com
aproximadamente 51 MiB descompactados. Este protocolo mede o reconhecimento no
aparelho antes de considerar qualquer troca de modelo. A gramática de ativação
está habilitada por padrão; nesse modo, dizer a pergunta na mesma frase que
"Farol" não é suportado: o app pede que a pessoa fale a pergunta em seguida.

## Procedimento

Avalie três pessoas em ambiente silencioso e com ruído moderado. Para cada
combinação de aparelho, condição e configuração:

1. Diga "Farol" 20 vezes, com pausas naturais, e conte quantas ativações foram
   reconhecidas.
2. Converse por cinco minutos sem dizer a palavra de ativação e conte ativações
   indevidas.
3. Faça cerca de 30 perguntas reais do vocabulário do Farol e compare a
   transcrição com o texto esperado.
4. Meça o tempo entre o início do carregamento do modelo e o primeiro resultado.
5. Repita com o modelo pequeno sem gramática e com a gramática de ativação. Se
   houver outro modelo aprovado para teste, registre-o sem substituir o padrão.

Os logs `[VOSK-AVAL]` aparecem apenas em builds de desenvolvimento e não
registram o conteúdo reconhecido; use gravação manual dos resultados para
calcular as métricas.

| Modelo/configuração | Aparelho e condição | Ativações corretas / 20 | Falsos disparos / 5 min | Erros nas perguntas | Carga até 1º resultado |
|---|---|---:|---:|---:|---:|
| Small PT 0.3, sem gramática |  |  |  |  |  |
| Small PT 0.3, gramática de ativação |  |  |  |  |  |

Não distribua uma variante diferente antes de avaliar o reconhecimento e
confirmar o tamanho do pacote final do build.
