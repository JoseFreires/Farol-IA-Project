# Farol — Prompt para o CLI: análise no código e melhorias

> **Como usar:** envie este arquivo inteiro ao agente de CLI, com a raiz do repositório (backend + mobile) como diretório de trabalho.
> **Regra de ouro:** primeiro **analise e reporte** (Etapa 1). Só implemente (Etapa 2) depois da aprovação do dono do projeto.

---

## 0. Contexto do projeto

O **Farol** descreve o ambiente por imagem para pessoas com deficiência visual (baixa visão a cegueira).

- **Backend (Python, venv):** FastAPI + YOLO (Ultralytics) + Ollama com `qwen2.5vl:3b`. Rotas: `WS /ws/frames` (quadros do celular), `GET /saida` (mensagens para falar), `POST /pergunta`, `GET /health`. Pasta `backend/`, código em `backend/src/farol/`, configuração em `backend/config/farol.yaml`.
- **Mobile (Expo SDK 58, React Native 0.88, TypeScript):** câmera → `WS /ws/frames`; polling de `GET /saida` a cada 350 ms; fala por `expo-speech`; escuta offline por `react-native-vosk` (palavra de ativação "Farol" + coleta da pergunta). Código em `src/` do mobile.
- **Usuário final não enxerga:** silêncio ambíguo é perigoso, mensagens velhas confundem, e a fala do app **nunca** pode atrapalhar a captação da pergunta.

Documento relacionado (se existir no repositório): `farol-latencia-fila-saida.md` (diagnóstico de latência da fila de saída). Esta tarefa **não** repete aquele trabalho, mas os itens se tocam; onde isso acontece está sinalizado.

**Observação sobre números de linha:** as referências `arquivo:linha` abaixo vêm de uma leitura dos zips de 04/11/2026. **Confirme no código atual**; elas podem ter mudado.

---

## 1. Restrições (valem para todas as etapas)

1. **Arquitetura enxuta.** Não crie camadas, classes ou arquivos novos sem necessidade clara. Prefira alterar o que existe.
2. **Não quebre contratos** das rotas `/ws/frames`, `/saida`, `/pergunta`, `/health` nem o formato de `MensagemSaida`. Campos novos devem ser **opcionais**.
3. **Não apague nem sobrescreva** a pasta do modelo Vosk atual nem arquivos do usuário. Para tirá-la do build, **mova** (sugestão: para fora do projeto) e informe.
4. **Não introduza dependência nativa nova** (bibliotecas que exijam novo build além do já previsto) sem pedir confirmação.
5. **Português do Brasil** em textos falados ao usuário e em comentários.
6. **Validações obrigatórias ao fim de cada item:**
   - Backend: `pytest` na pasta `backend` (a suíte tinha 54 testes passando; não pode regredir).
   - Mobile: `npx tsc --noEmit` e `npx expo lint` (havia um aviso de lint preexistente sobre `require()` em `services/escuta.ts`; não precisa corrigir).
7. **Commits pequenos**, um por item, com mensagem explicando o porquê.
8. Não coloque tokens, URLs privadas ou segredos no código ou em logs.

---

## 2. Decisões já tomadas (não reabrir)

| Tema | Decisão |
|---|---|
| Prioridade das saídas | Risco > resposta de pergunta > narração do ambiente. A descrição **inicial** é protegida: o risco não a corta. |
| Pergunta | Só é possível depois da descrição inicial. |
| Modelo de linguagem | `qwen2.5vl` via Ollama. |
| Arquitetura | Enxuta; skills de LLM em `SKILL.md` carregadas por `skills.py`; regras (mudança, risco, roteador) em Python. |

### Decisões **assumidas por padrão** (o dono pode alterar aqui antes de enviar)

| Tema | Padrão adotado neste prompt |
|---|---|
| **Risco durante a escuta da pergunta** | **Opção A (mais segura):** o risco **interrompe a escuta**, o alerta é falado, e a escuta é reaberta com "Pode perguntar." Alternativa B: o risco só é falado depois da pergunta. |
| **FPS** | Meta **configurável**, padrão **10**. O pedido original foi 60 FPS; a análise concluiu que isso **não é alcançável** com `takePictureAsync` (ver item 1). O valor 60 pode ser configurado como teto, sem garantia de ser atingido. |
| **Palavra de ativação com gramática** | Ao usar o modelo pequeno, a escuta passiva usa `grammar` (`["farol", "[unk]"]`). Consequência aceita: a pergunta dita **na mesma frase** ("Farol, onde está a mochila?") deixa de funcionar nesse modo; o app passa a responder "Pode perguntar." e abrir a coleta. Controlado por uma flag. |

---

## 3. Ordem recomendada de execução

1. **Item 2 — Modo escuta** (corrige perguntas erradas; mudança isolada no app; maior impacto por esforço).
2. **Item 1 — Frequência de quadros** (mobile + um ajuste no backend).
3. **Item 3 — Modelo Vosk** (exige novo build nativo e teste com voz; deixar por último).

---

# ETAPA 1 — Análise (somente leitura, **não altere código**)

Para cada item, responda às perguntas com **evidência (`arquivo:linha`)** e conclua se a hipótese se **confirma**, **refuta** ou é **parcial**. Entregue o relatório em `docs/analise-melhorias.md` (ou no próprio terminal, se preferir) neste formato:

| Hipótese | Resultado | Evidência | Observação |
|---|---|---|---|

Depois do relatório, liste **riscos e dúvidas** e **pare para aprovação**.

---

## Item 1 — Frequência de quadros (FPS)

### Problema relatado
Os quadros ainda chegam lentos. O dono pediu 60 FPS.

### Hipóteses a verificar
- **H1.1** A constante de 24 FPS não manda no ritmo real: o período efetivo é `duração da captura + 250 ms`, porque o código usa `Math.max(250, INTERVALO_MS - duracao)` (`transmissao.ts` ≈ `:51` e `:264`). Trocar a meta para 60 não muda o ritmo.
- **H1.2** `takePictureAsync` (com `base64: true`, `quality: 0.35`, `skipProcessing: true`, ≈ `:217`) é lento no Android e impede qualquer taxa próxima de 60 FPS.
- **H1.3** O envio pelo WebSocket não verifica `bufferedAmount` (≈ `:240`), então com uplink lento os quadros se acumulam no soquete e o backend processa quadros velhos.
- **H1.4** No backend, `ingerir_frame` decodifica **cada** JPEG (`cv2.imdecode`) dentro de uma função `async` (`api/rota_frames.py` ≈ `:43`; `captura.py` ≈ `:68-73`), bloqueando o loop de eventos que também atende `/saida` e `/pergunta`, e o `SlotFrame` guarda só o último quadro (o restante da decodificação é desperdício).
- **H1.5** A confirmação de objeto novo/saído conta **quadros** (`frames_para_entrar: 3`, `frames_para_sair: 5`, `farol.yaml` ≈ `:21-22`, `mudanca/estabilizador.py`), então o tempo real de confirmação depende do FPS; mudar o FPS muda o comportamento sem querer. Note também que `main.py` ≈ `:313-314` zera o debounce da segunda camada.

### Perguntas
1. Qual é o FPS **real** e a `capturaMediaMs` hoje? (O app já loga `Auditoria de frames mobile` a cada 5 s em `registrarResumoEnvio`; procure no código como obter isso.)
2. Existe outro ponto que limite o ritmo (timers, `agendarProximoFrame`, estados `enviando`)?
3. Qual é o tamanho médio do JPEG gerado e o que determina esse tamanho (resolução do aparelho, `quality`)?
4. O backend registra quadros recebidos vs processados? (`auditoria ws_frames atividade` e `auditoria processamento resumo`.)
5. Qual a taxa máxima que o loop principal do backend suporta (detecção serial + `sleep(0.05)` em `main.py` ≈ `:470`)?

---

## Item 2 — Modo escuta ("Farol" não pode competir com a descrição)

### Problema relatado
Ao dizer "Farol", o app abre o contexto de pergunta, mas a descrição do ambiente continua sendo falada e **corta/atrapalha**, e a pergunta é transcrita errada.

### Regra desejada (requisito do dono)
> Quando a palavra "Farol" for detectada e a funcionalidade de pergunta abrir, o app **só ouve** e **não fala o ambiente**.

### Hipóteses a verificar
- **H2.1** Em `EscutaContext.tsx` ≈ `:135-149` (`aoDetectarAtivacao`), o app chama `interromperInformativas()`, fala "Pode perguntar." e abre a coleta, mas **nada impede novas mensagens informativas** de entrarem depois.
- **H2.2** `mensagens.ts` continua o polling de `/saida` durante a escuta, e `gerenciadorFala.ts` ≈ `:118-126` fala qualquer mensagem de prioridade 3 assim que `falando` é falso, **inclusive durante `ouvindoPergunta`**. A fala entra no microfone e contamina a transcrição.
- **H2.3** `dizer()` (`dialogo.ts`) usa `aguardarFimDaFala` (`fala.ts` ≈ `:49-55`), que espera **qualquer** fala em curso (até 10 s), inclusive uma informativa que começou no meio. A coleta abre atrasada e com o microfone pausado por mais tempo.
- **H2.4** Há 650 ms de confirmação para "Farol" isolado (`escuta.ts` ≈ `:18`, `:303-312`). Durante esse intervalo a descrição continua falando por cima.
- **H2.5** `interromperInformativas()` apaga as informativas pendentes. Como o backend já "consumiu" o evento, essa mensagem se perde (perda silenciosa de eventos; relacionado ao item S4 de `farol-latencia-fila-saida.md`).
- **H2.6** O caminho do botão/toque longo (`perguntarAgora`, `EscutaContext.tsx` ≈ `:255-280`) tem o mesmo problema.

### Perguntas
1. Liste **todos** os pontos do app que chamam `Speech.speak` (inclusive `falarAsync` e `criarNarrador` em `fala.ts`): algum **escapa** do `gerenciadorFala`?
2. Quais estados existem hoje (`ouvindoPergunta` no contexto React, `coletandoPergunta` e `pausado` no motor)? O `gerenciadorFala` conhece algum deles?
3. Em que momento exato a coleta começa e termina (`iniciarColetaPergunta`, `finalizarPergunta`, `aoExpirar`, timers de 2 s e 30 s)?
4. O que acontece com a resposta (`camera.tsx` ≈ `:261`, `:271`) enquanto outra fala está em curso?

---

## Item 3 — Modelo Vosk instável

### Problema relatado
O modelo Vosk atual é instável. Foi pedida uma versão que **não estoure o limite de build**.

### Fatos levantados (pesquisa, para você confirmar no código)
- Modelos oficiais de português: `vosk-model-small-pt-0.3` (~31 MB, pensado para celular, ~300 MB de memória) e `vosk-model-pt-fb-v0.1.1-20220516_2113` (1,6 GB, pensado para servidor).
- O app usa o **grande**, reduzido (~422 MB, sem o `rescore/G.carpa`), configuração fora do padrão oficial.
- Modelos **grandes não aceitam** reconfiguração de vocabulário; os **pequenos em geral aceitam**. A biblioteca `react-native-vosk` aceita `start({ grammar: [...], timeout })`.
- Erro de reconhecimento (sem garantia de equivalência entre medidas): Common Voice 32,6% (pequeno) contra 27,7% (grande); CORAA (fala espontânea) 68,9% contra 54,3%.
- Licenças: pequeno Apache 2.0; grande GPLv3 (conferir antes de distribuir o app).

### Hipóteses a verificar
- **H3.1** `escuta.ts` ≈ `:10` fixa `MODELO = "model-pt-fb-v0.1.1-20220516_2113"` e o `app.json` aponta o plugin para a pasta **interna** duplicada do modelo.
- **H3.2** `vosk.start()` é chamado **sem `grammar`** (`escuta.ts` ≈ `:414`, `:234`, `:491`), ou seja, a palavra de ativação é procurada em reconhecimento livre.
- **H3.3** O regex `ATIVACAO` tolera variantes (`faraó|varol|faroli`, ≈ `:13`) e `normalizarTranscricaoParaFarol` corrige erros recorrentes (≈ `:77-107`): sinais de reconhecimento fraco.
- **H3.4** O ciclo `pausar()`/`retomar()` faz `vosk.stop()` e `vosk.start()` a cada fala do app (≈ `:464-498`), com a serialização por `filaTransicao`. Isso é uma fonte plausível de instabilidade/corrida no módulo nativo.
- **H3.5** Existe `grammar` em alguma parte do código? (`start` aceita, mas não parece ser usado.)

### Perguntas
1. Quais arquivos referenciam o nome do modelo (`app.json`, `escuta.ts`, `eas.json`, `.easignore`/`.gitignore`)?
2. Qual é o tamanho atual da pasta do modelo e do arquivo de build enviado ao EAS?
3. A estrutura da pasta do modelo está correta (nome começa com `model-`, contém `am/final.mdl`, `conf/model.conf`, `graph/HCLG.fst`)?
4. O fluxo "pergunta imediata na mesma frase" (`restoNormalizado` em `processarTextoFinal`) seria quebrado por uma gramática no modo passivo? Descreva o impacto.

---

# ETAPA 2 — Implementação (somente após aprovação)

Implemente **um item por vez**, na ordem da seção 3, com validações da seção 1.

---

## Item 2 — Modo escuta

### Máquina de estados (no app)

```
NORMAL ──(parcial contém "farol")──> ESCUTANDO ──(pergunta enviada)──> RESPONDENDO ──(resposta falada)──> NORMAL
   ^                                     │  │
   │                                     │  └─(expirou / erro / cancelou / alarme falso)──> NORMAL
   └──────────(tempo de segurança)───────┘
```

### Regras

1. **ESCUTANDO** começa no **primeiro parcial** com "farol" (não esperar os 650 ms de confirmação) e também no caminho do botão/toque longo.
2. No instante em que entra em ESCUTANDO: **parar** imediatamente a fala informativa em curso (`Speech.stop`).
3. Em ESCUTANDO e RESPONDENDO, mensagens **informativas (prioridade 3)** **não são faladas**. O gerenciador **retém apenas a mais recente**.
4. Ao voltar a NORMAL: descartar retidas **vencidas** (use a idade da mensagem; ver nota abaixo) e falar **no máximo uma**, a mais recente ainda válida, **depois** que a resposta terminar de ser falada.
5. **Risco (prioridade 1)**, padrão **Opção A**: interrompe a escuta (`cancelarColetaPergunta` + pausar o microfone), fala o alerta, e ao terminar **reabre** a escuta com "Pode perguntar." e nova coleta. *(Se o dono escolher a Opção B, o risco é retido e falado ao fim da resposta.)*
6. **Alarme falso:** se ESCUTANDO começou por um parcial de "farol" e **nenhuma confirmação** vier em `TEMPO_ALARME_FALSO_MS` (padrão 3000), voltar a NORMAL e retomar a fala normalmente.
7. **Tempo de segurança:** ESCUTANDO/RESPONDENDO nunca dura mais que `TEMPO_MAX_MODO_ESCUTA_MS` (padrão 45000). Ao estourar, voltar a NORMAL (o app não pode ficar mudo para sempre). Use `try/finally`.
8. **Folga de eco:** manter a folga de ~500 ms (`FOLGA_APOS_PAUSA_MS`) depois do último áudio do app antes de abrir o microfone.
9. A **resposta da pergunta** (prioridade 2) continua tocando normalmente e **não** pode ser cortada por informativas.
10. Corrigir `aguardarFimDaFala`/`dizer` para esperar **apenas a fala de sistema** que ele mesmo iniciou, e não falas informativas que começarem no meio.

### Forma sugerida da API (ajuste ao código existente, sem criar camada nova)

No `gerenciadorFala`:

```ts
entrarModoEscuta(): void     // para a informativa em curso e passa a reter prioridade 3
sairModoEscuta(): void       // descarta vencidas, fala no máximo a mais recente válida
get emModoEscuta(): boolean
```

No `escuta.ts`: emitir um evento novo **`aoPossivelAtivacao`** no primeiro parcial com "farol" (o `EscutaContext` chama `entrarModoEscuta()`). O `EscutaContext` chama `sairModoEscuta()` quando a resposta termina, expira, erra, cancela ou estoura o tempo de segurança.

### Nota sobre validade das mensagens
O app compara o `timestamp` do servidor com o relógio do celular (`mensagens.ts` ≈ `:139-155`, `gerenciadorFala.ts` ≈ `:141-144`), sujeito a erro de relógio. Se o campo `idadeMs` (idade calculada no servidor) existir, use-o; **se não existir, não o invente** neste item, apenas use a validade que já existe. Esse ajuste faz parte de `farol-latencia-fila-saida.md` (S5).

### Critérios de aceite (teste manual, descreva o resultado de cada um)

1. **Descrição falando → "Farol":** a fala informativa para na hora. Durante toda a janela da pergunta **nenhuma** descrição é falada (use `scripts/reproduzir_video_api.py` com objetos novos entrando para provocar mensagens).
2. A pergunta é transcrita **sem** trechos da fala do app.
3. A resposta é falada **inteira**, sem corte.
4. Uma informativa retida e ainda válida é falada **depois** da resposta; uma vencida é descartada.
5. **Alarme falso** (ruído parecido com "farol"): volta ao normal em até `TEMPO_ALARME_FALSO_MS`.
6. **Risco durante a escuta** (Opção A): a escuta é interrompida, o alerta é falado e "Pode perguntar." reabre a escuta.
7. **Botão / toque longo** segue exatamente as mesmas regras.
8. **Pergunta que nunca vem:** ao fim do tempo de segurança o app volta a falar normalmente.
9. `tsc` e `lint` passam.

---

## Item 1 — Frequência de quadros

### Mobile (`transmissao.ts`)

1. Criar uma constante **`FPS_ALVO`** (padrão **10**), no topo do arquivo, com comentário explicando que o valor real depende do tempo de captura. Derivar o intervalo dela.
2. **Remover a espera mínima fixa de 250 ms.** O próximo quadro é agendado em `max(0, INTERVALO - duracaoDaCaptura)` (mantenha uma espera de segurança pequena, por exemplo 10 a 30 ms, apenas para ceder o laço). Em falha de captura, manter o recuo atual.
3. **Controle de fluxo:** antes de enviar, se `socket.bufferedAmount` ultrapassar um limite (padrão 256 KB, constante nomeada), **pular** o quadro (agendar curto) e contar `quadrosPulados`.
4. Incluir `quadrosPulados` e `periodoMedioMs` no log `Auditoria de frames mobile`.
5. Se for simples e seguro, reduzir o custo por quadro (por exemplo, avaliar `pictureSize` do `expo-camera` para uma resolução menor), **sem** aumentar a perda de qualidade que prejudique o YOLO. Se não for simples, apenas documente.
6. **Não** trocar a biblioteca de câmera neste item. Se o dono quiser mais de ~10 FPS reais, registrar como proposta separada (VisionCamera com frame processor, exige build nativo, esforço grande, compatibilidade com Expo SDK 58 e RN 0.88 a verificar).

### Backend

1. **Não bloquear o loop de eventos** em `ws_frames`: decodificar fora dele (`await asyncio.to_thread(...)`) **ou**, melhor, guardar os **bytes** do último quadro no `SlotFrame` e decodificar só o quadro que o loop principal vai processar. Escolha a opção menos invasiva e justifique.
2. **Confirmação por tempo:** em `mudanca/estabilizador.py`, confirmar entrada/saída por tempo, com um mínimo de quadros, usando chaves novas no `farol.yaml`:

```yaml
mudanca:
  tempo_para_entrar_s: 0.6
  tempo_para_sair_s: 1.5
  min_quadros_para_entrar: 2
  # frames_para_entrar / frames_para_sair ficam como valores de reserva
```

   Usar `time.monotonic()`. Atualizar `tests/test_estabilizador.py`. O comportamento deve deixar de depender do FPS.
3. Em `scripts/reproduzir_video_api.py`, adicionar `--fps` (para imitar o celular, por exemplo 2, 6, 10) e, opcionalmente, `--jitter`.

### Critérios de aceite

1. Não existe mais piso fixo de 250 ms; o FPS reportado no log passa a refletir o tempo de captura.
2. Com `reproduzir_video_api.py --fps 30`, `GET /health` e `GET /saida` respondem sem travar (registre latências p50/p95 medidas).
3. Com uplink limitado (simule), `quadrosPulados` aumenta e **o atraso dos quadros não cresce** continuamente.
4. Trocar o FPS de 2 para 10 **não muda** quando um objeto novo é confirmado (confirmação por tempo).
5. `pytest`, `tsc` e `lint` passam.
6. Documente no relatório final o FPS **real** obtido no aparelho (se houver acesso) e por que 60 FPS não é atingível.

---

## Item 3 — Modelo Vosk

### Preparação (sem trocar o padrão ainda)

1. Tornar o modelo **configurável** em um único lugar (constante em `escuta.ts` + `app.json`), mantendo o atual como padrão até a avaliação.
2. Adicionar a flag **`USAR_GRAMATICA_ATIVACAO`** (padrão `false` enquanto o modelo grande for o ativo; `true` com o pequeno).
3. Em modo passivo com a flag ligada, iniciar o reconhecedor com `start({ grammar: ["farol", "[unk]"] })`. Para coletar a pergunta, **parar e reiniciar sem gramática**, usando a fila `filaTransicao` existente, sem condição de corrida. Voltar à gramática ao fim da pergunta.
4. Com a gramática ligada, o fluxo "pergunta na mesma frase" fica desativado (ver seção 2); ao detectar "farol", seguir o fluxo "Pode perguntar." do item 2.
5. Log de avaliação (prefixo `[VOSK-AVAL]`): cada resultado final, acertos da palavra de ativação e disparos sem a palavra. Apenas em modo de desenvolvimento.

### Troca do modelo (build)

1. Baixar `vosk-model-small-pt-0.3` (fonte oficial do Vosk). Extrair e **verificar a estrutura**: o modelo deve estar na pasta cujo nome comece com `model-` e conter diretamente `am/final.mdl` e `conf/model.conf` (cuidado com pasta duplicada, que já ocorreu com o modelo grande). Nome sugerido: `model-pt-small-0.3`.
2. Atualizar o caminho em `app.json` (plugin `react-native-vosk`, campo `models`) e a constante `MODELO`.
3. **Mover** a pasta do modelo grande para fora de `assets/` (não apagar), para não ir no pacote de build. Se existir `.easignore`, lembrar que ele **substitui** as regras do `.gitignore` no upload do EAS: copiar as regras necessárias antes de acrescentar exclusões.
4. Conferir o conteúdo do pacote com `eas build:inspect` antes do build.
5. Gerar novo *development build* (alterar plugin/modelo exige novo build nativo): `eas build --profile development --platform android`.

### Avaliação (precisa de voz real; documente o protocolo)

Documentar em `docs/avaliacao-vosk.md` um protocolo simples: ~30 perguntas reais do vocabulário do Farol, 3 pessoas, ambiente silencioso e com ruído. Registrar por modelo/configuração:

| Métrica | Como medir |
|---|---|
| Taxa de acerto da palavra "Farol" | dita 20 vezes por pessoa |
| Falsos disparos | 5 minutos de conversa sem a palavra |
| Erro de transcrição das perguntas | comparar com o texto esperado |
| Tempo de carga do modelo | do `loadModel` ao primeiro resultado |

Comparar: (a) grande atual, (b) pequeno sem gramática, (c) pequeno com gramática na ativação.

### Critérios de aceite

1. O app roda com o modelo pequeno, **sem estourar** o limite do EAS (registre o tamanho do pacote antes e depois).
2. Com `USAR_GRAMATICA_ATIVACAO = true`, "Farol" é detectado com a gramática e a pergunta é coletada sem gramática, sem travar nem perder a palavra seguinte.
3. A flag e o modelo podem ser revertidos mudando **só** a constante e o `app.json` (sem apagar nada).
4. `tsc` e `lint` passam; o protocolo de avaliação está documentado.

### Não fazer neste item
- Não remover `normalizarTranscricaoParaFarol` nem o regex de variantes até haver medição com o modelo novo.
- Não trocar de motor de reconhecimento (Porcupine, reconhecedor do sistema etc.) sem aprovação. Se a avaliação mostrar que o Vosk pequeno não basta, **reporte** as opções em vez de implementar.

---

## 4. Entrega final esperada

Ao terminar, devolva:

1. **Relatório da Etapa 1** (tabela de hipóteses com resultado e evidência).
2. **Resumo da Etapa 2** por item: arquivos alterados, o que mudou, o que **não** foi feito e por quê.
3. **Resultado das validações** (`pytest`, `tsc`, `lint`) e dos critérios de aceite, **marcando como "não testado"** o que depende de aparelho ou de voz real.
4. **Pendências e riscos** (por exemplo: perda silenciosa de eventos, validade medida com relógios diferentes, necessidade de novo build).
5. **Decisões que ficaram em aberto** para o dono do projeto.

Se encontrar uma contradição entre este documento e o código, **pare e reporte** em vez de escolher sozinho.
