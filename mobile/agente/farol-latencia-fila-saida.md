# Farol — Latência e atraso na fila de saída

**Diagnóstico e soluções propostas**

Base da análise: código do backend (`backend/`) e do app mobile (`src/`), versões dos zips de 04/11/2026.

---

## 1. Resumo executivo

**Sintoma:** nos testes no Android os fluxos funcionam, mas o tempo entre algo mudar na cena e o usuário ouvir isso é alto. Exemplo: um objeto novo só é comunicado depois de um intervalo grande, e nesse ponto o contexto já mudou.

**Conclusão principal:** o atraso **não vem de um único gargalo de processamento**. Ele é a soma de várias esperas, e as maiores são **decisões de projeto**, não custo de CPU:

| # | Causa | Efeito | Gravidade |
|---|---|---|---|
| C1 | O filtro de relevância (`limiar_score: 0.6`) **nunca é atingido por um objeto inanimado novo sozinho** | O objeto só é anunciado quando outro evento "ajuda" a somar pontos, possivelmente minutos depois | **Alta** |
| C2 | O app captura no máximo ~1,5 a 4 quadros por segundo (espera mínima de 250 ms), e a confirmação de objeto conta **quadros**, não tempo | Entrada leva ~1 s e saída ~2,5 s só de confirmação | **Alta** |
| C3 | Mensagens informativas **expiram (4 s)** enquanto esperam atrás de uma fala longa no app, e o evento já foi consumido no backend | O aviso de objeto novo é descartado em silêncio e nunca mais volta | **Alta** |
| C4 | O LLM é chamado em cada mudança drástica e **depois de cada alerta de risco**; roda em fila única, sem `keep_alive`, sem streaming | Esperas de vários segundos; o resultado pode ser descartado e refeito | **Média/Alta** |
| C5 | O app consulta `/saida` por polling a cada 350 ms, uma mensagem por requisição | +175 ms em média, mais o custo de requisições por túnel | Média |
| C6 | A validade (TTL) conta a partir da criação da mensagem e é comparada com o relógio do celular | Mensagem velha parece nova; diferença de relógio pode descartar ou prolongar mensagens | Média |
| C7 | JPEG decodificado dentro do loop de eventos do FastAPI, todos os quadros decodificados, sem controle de fluxo no envio | Fila invisível de quadros velhos; `/saida` disputa o mesmo loop | Média |
| C8 | Cooldown de 4 s contado a partir do enfileiramento, não do fim da fala | Silêncios maiores que o necessário | Baixa |

**Recomendação:** começar por **medir** (seção 7), aplicar os **ajustes rápidos** (C1, C2, C3, C6, C8, `keep_alive`) e só depois mexer em arquitetura (push por WebSocket, streaming do LLM).

**Por que o teste com vídeo parecia bom:** o `scripts/reproduzir_video_api.py` envia os quadros na taxa nativa do vídeo (tipicamente 30 fps). Nessa taxa, "3 quadros" são 100 ms. No app real, são mais de 1 s. A bancada de testes precisa simular a taxa do celular (seção 8).

---

## 2. Escopo e limites desta análise

**O que foi feito:** leitura do código do backend e do mobile, leitura da configuração, cálculo dos pesos e limiares a partir do código.

**O que não foi feito (e muda os números):**
- Não executei o backend nem o app. **Não há medição real** de tempo de YOLO, de geração do LLM, de captura no celular ou de rede.
- A máquina é desconhecida. O `train-3/args.yaml` indica treino em **CPU** (`device: cpu`), o que sugere, sem confirmar, que o backend também roda sem GPU. Se o Ollama roda em CPU, o LLM e o YOLO **disputam o mesmo processador**.
- Valores marcados como "(medir)" na seção 3 precisam ser preenchidos com a instrumentação proposta.

---

## 3. O caminho de um objeto novo, etapa por etapa

Cenário: um objeto aparece na câmera e deve ser falado ao usuário.

| Etapa | Onde | Espera típica | Origem do valor |
|---|---|---|---|
| 1. Captura do quadro no celular | `transmissao.ts:217` `takePictureAsync` | (medir) | Depende do aparelho |
| 2. Pausa entre capturas | `transmissao.ts:264` | **≥ 250 ms** | Fixo no código |
| 3. Envio por Wi-Fi/túnel | WebSocket `/ws/frames` | (medir) | Rede |
| 4. Decodificação do JPEG | `rota_frames.py:43` | (medir) | No loop do FastAPI |
| 5. Espera pelo loop principal | `main.py:134-148`, `:470` | até ~50 ms + duração do quadro anterior | `time.sleep(0.05)` + detecção |
| 6. Detecção (YOLO COCO + degraus) | `deteccao.py`, `main.py:158` | (medir) | Serial, 1 thread |
| 7. Confirmação de presença | `estabilizador.py`, `farol.yaml:21` | **3 quadros** ≈ 2 períodos de captura | Config |
| 8. Pontuação e limiar | `identificar_mudanca.py:214` | **indeterminada** (ver C1) | Config |
| 9. Cooldown informativo | `identificar_mudanca.py:210-215` | **até 4 s** | Config |
| 10. Texto Python **ou** LLM | `main.py:339-455` | Python: ~0. LLM: (medir, segundos) | Só mudança drástica usa LLM |
| 11. Fila de saída (TTL 4 s) | `fila_saida.py:137` | (depende) | Config |
| 12. Polling do app | `mensagens.ts:29` | **0 a 350 ms** | Fixo |
| 13. Espera da fala atual no app | `gerenciadorFala.ts:117-129` | **até o fim da fala em curso** | Duração do TTS |
| 14. Fala do novo aviso | `expo-speech` | duração do texto | TTS |

**Cálculo ilustrativo** (hipóteses: captura de 350 ms, rede boa, YOLO de 120 ms, só texto Python):
- período do quadro = 350 + 250 = **600 ms**
- confirmação (2 períodos adicionais) ≈ **1,2 s**
- + detecção/decisão ≈ 0,3 s
- + polling médio ≈ 0,2 s
- = **~1,7 s** no melhor caso para uma **pessoa**. Para um **objeto inanimado**, esse número nem se aplica, porque ele fica preso na etapa 8.

Cada fala longa em curso (3 frases de descrição) soma de 6 a 10 s de espera na etapa 13 (estimativa para pt-BR; medir).

---

## 4. Causas raiz com evidência

### C1. O limiar de pontuação trava anúncios de objetos inanimados

`identificar_mudanca.py:214-215`:

```python
pode_falar = rastreamento.pendente_drastica or rastreamento.score_pendente >= limiar   # 0.6
deve_falar = bool(rastreamento.eventos_pendentes and pode_falar and cooldown_vencido)
```

A pontuação de um evento `ENTROU` é `1.2 × peso_classe × peso_distância × peso_região` (`identificar_mudanca.py:56-64`). O código só produz as distâncias `"perto"` (0,8) e `"a média distância"` (0,5), porque `distancia()` em `filtro.py:121-126` não emite `"muito perto"` e `area_min: 0.01` elimina os `"longe"`. O peso `"muito perto": 1.0` do YAML nunca é usado. Calculado com o próprio código:

| Classe (peso) | Posição | "perto" (0,8) | "a média distância" (0,5) |
|---|---|---|---|
| `person` (1,0) | à frente | **0,96 ✔** | **0,60 ✔** (no limite) |
| `person` (1,0) | à esquerda/direita | **0,67 ✔** | 0,42 ✘ |
| `dog` (0,9) | à frente | **0,86 ✔** | 0,54 ✘ |
| `dog` (0,9) | à esquerda/direita | **0,60 ✔** (0,6048) | 0,38 ✘ |
| classe sem peso, ex. `microwave` (0,5 padrão) | à frente | 0,48 ✘ | 0,30 ✘ |
| `chair` (0,4) | à frente | 0,38 ✘ | 0,24 ✘ |

**Consequência:** para qualquer classe que não seja pessoa, animal ou veículo, o **máximo possível é 0,48**, abaixo do limiar. O evento fica em `eventos_pendentes` somando pontos (`score_pendente` nunca decai, `identificar_mudanca.py:204`) e só é falado quando outro evento chega. **Não há limite de tempo para essa espera.** É a explicação mais direta para "o objeto novo só é comunicado depois de muito tempo".

### C2. Taxa real de quadros baixa e confirmação por contagem de quadros

- `transmissao.ts:51` declara meta de 24 FPS, mas `:264` agenda o próximo quadro com `Math.max(250, INTERVALO_MS - duracao)`. Como a captura leva mais que 42 ms, a espera é **sempre 250 ms**. O período real é `duração da captura + 250 ms`, ou seja, **~1,5 a 2,5 FPS** com captura de 150 a 400 ms. O próprio app já registra `fps` e `capturaMediaMs` a cada 5 s (`registrarResumoEnvio`), então o valor real está disponível nos logs.
- O backend confirma entrada com `frames_para_entrar: 3` e saída com `frames_para_sair: 5` (`farol.yaml:21-22`), contados em **quadros processados** (`estabilizador.py`). `main.py:313-314` zera o debounce da segunda camada, então só vale o do estabilizador.
- Efeito a ~2 FPS: **entrada ≈ 1 s** e **saída ≈ 2,5 s**.
- O detector de degraus roda a cada 2 quadros (`a_cada_n_frames: 2`), logo a cada ~1 s no app real.
- O rastreador (`DetectorCoco` usa `track(..., persist=True)`) é desenhado para vídeo contínuo. A 2 FPS, objetos em movimento deslocam-se muito entre quadros, e o ID pode ser perdido ou trocado, o que reinicia a contagem de presença no `Estabilizador`. Esta é uma **hipótese a verificar** nos logs (`Ignoradas detecções COCO sem id_track`, nível debug).

### C3. Mensagens expiram na fila de fala do app, e o evento é perdido

- `gerenciadorFala.ts:117-129`: uma nova mensagem informativa (prioridade 3), com o app falando, **espera o fim da fala atual**. Ela só mantém a mais recente na fila.
- `gerenciadorFala.ts:141-144` e `:193`: ao sair da fila, a mensagem é descartada se `agora > timestamp + expiraEmMs`, e a validade informativa é **4 s** (`farol.yaml:40`).
- Uma descrição de ambiente leva facilmente mais que 4 s para ser falada. O aviso de objeto novo que chega durante ela **expira antes de ser falado**.
- No backend, `identificar_mudanca.py:223-225` **zera `eventos_pendentes` no momento da decisão**, antes de o usuário ouvir. Não há confirmação de entrega. Resultado: **entrega no máximo uma vez**. Se o app descarta, o objeto está "confirmado" no estado e **nunca mais será anunciado**.

### C4. Uso do LLM

Fatos do código:
- A skill `descrever-ambiente` é chamada **só com texto**. `main.py` enfileira sem `imagem=` (por isso `jpeg_qualidade` e `jpeg_max_lado` só afetam o caminho de pergunta).
- Chamadas ao Ollama: `skills.py:139-160` consome o **fluxo inteiro** e só depois devolve o texto. Nada é falado até a geração terminar (até 120 tokens, `num_predict`).
- Não há `keep_alive` nem aquecimento (busca por `keep_alive`, `warm` e `num_ctx` no repositório não encontra ocorrências). O Ollama descarrega o modelo quando fica ocioso, então a primeira chamada depois de uma pausa paga o carregamento do modelo.
- `FilaLLM` tem um único consumidor. Se `ocupada_com(2)` é verdadeiro, a mudança é **adiada** (`main.py:398-425`).
- O parâmetro `valida` da `FilaLLM` existe (`fila_llm.py:23`), mas **nenhuma chamada o usa**: tarefas velhas não são descartadas ao sair da fila.

**Tempestade de cancelamentos por risco** (`main.py:164-193`): cada alerta de risco faz `fila_llm.cancelar_tudo()`, incrementa `revisao_contexto` e marca `contexto_invalido=True`. Isso tem três efeitos:
1. As callbacks `ao_concluir*` descartam o resultado quando a revisão mudou (`main.py:252`, `:354`). O trabalho do LLM é **jogado fora**.
2. `contexto_invalido` gera uma **redescrição completa por LLM** (`identificar_mudanca.py:122-124`) depois de cada alerta.
3. Um risco persistente (por exemplo, um degrau repetido a cada `repetir_apos_s: 10`, ou se aproximando por `fator_aproximacao: 1.3`) mantém o ciclo cancelar → redescrever → cancelar. O LLM **pode ficar sem concluir** por longos períodos.

Em CPU, a geração também **rouba processador do YOLO**, o que atrasa a detecção (e os alertas de risco) enquanto o LLM trabalha.

Detalhe menor: `fila_llm.py:113-116` faz `time.sleep(0.02)` **segurando o lock** quando a fila está vazia, o que bloqueia `enfileirar` e `ocupada_com` por até 20 ms.

### C5. Entrega por polling

`mensagens.ts:29`: intervalo de 350 ms após cada resposta, e `rota_frames.py:152` entrega **uma mensagem por requisição**. Atraso médio ≈ 175 ms + tempo de rede. Em túnel (ngrok), são cerca de 10 mil requisições por hora só desse polling.

### C6. Validade medida do jeito errado

- `fila_saida.py:137`: `expiracao = timestamp + expiraEmMs`, onde `timestamp` é o instante em que a **mensagem foi criada** (depois do LLM terminar ou da decisão). Ela **não mede a idade da observação**. Uma descrição baseada em um quadro de 10 s atrás nasce "nova".
- `mensagens.ts:139-155` e `gerenciadorFala.ts:141-144` comparam o `timestamp` do **servidor** com `Date.now()` do **celular**. Se os relógios divergirem (mais provável com servidor em outro lugar ou celular sem sincronização automática), mensagens são descartadas indevidamente ou nunca expiram.

### C7. Recepção de quadros no backend e controle de fluxo

- `rota_frames.py:43` chama `ingerir_frame` (decodificação `cv2.imdecode`, síncrona) **dentro de uma função assíncrona**. A decodificação bloqueia o loop de eventos, o mesmo que atende `/saida` e `/pergunta`.
- **Todos** os quadros recebidos são decodificados (`captura.py:68-73`), embora o `SlotFrame` guarde só o último. A maior parte do trabalho é jogada fora.
- O app **não verifica `bufferedAmount`** do WebSocket antes de enviar (`transmissao.ts:240`). Com uplink lento (dados móveis, túnel), os quadros se acumulam no soquete, e o backend processa **quadros velhos** (uma fila que nenhum log mostra).

### C8. Cooldown contado do lugar errado

`main.py:444` e `:401` gravam `ultimo_ts_fala` quando a mensagem é **enfileirada**, não quando o app termina de falar. Com falas longas, o cooldown efetivo é pior (ou, se a fala ficar na fila, o tempo conta contra a mensagem seguinte).

---

## 5. Soluções propostas

Legenda: **Esforço** P (horas), M (1 a 2 dias), G (vários dias). **Impacto** sobre "tempo até falar um objeto novo".

### 5.1 Ajustes rápidos

#### S1 (C1). Garantir que todo objeto novo relevante seja anunciado em tempo máximo
**Esforço P · Impacto muito alto.** Duas opções combináveis:

**a) Envelhecimento do evento:** um evento pendente fala depois de `max_espera_evento_s`, mesmo sem atingir o limiar.

```python
# estado
@dataclass
class EstadoRastreamento:
    ...
    primeiro_pendente_ts: float | None = None

# ao adicionar eventos pendentes:
if eventos_novos and rastreamento.primeiro_pendente_ts is None:
    rastreamento.primeiro_pendente_ts = agora

# decisão:
idade = 0.0 if rastreamento.primeiro_pendente_ts is None else agora - rastreamento.primeiro_pendente_ts
max_espera = float(cfg_mudanca.get("max_espera_evento_s", 2.5))
pode_falar = (
    rastreamento.pendente_drastica
    or rastreamento.score_pendente >= limiar
    or (bool(rastreamento.eventos_pendentes) and idade >= max_espera)
)
# ao falar: rastreamento.primeiro_pendente_ts = None
```

**b) Limiar por tipo de evento:** `ENTROU` usa um limiar mais baixo (`limiar_entrada`, ex.: 0,3) que `SAIU`, pois um objeto novo é mais informativo que um que sumiu. O anúncio de classes que ainda não foram descritas (`classes_inanimadas_anunciadas`) já existe em `contexto.py:57`, mas só roda **depois** que a decisão passou do limiar.

Além disso, **limpe o peso morto do YAML**: `"muito perto"` não é emitido. Ou implemente essa faixa em `distancia()` (por exemplo `area_rel >= 0.08`), ou remova o peso.

#### S2 (C2). Confirmar por tempo, não por quadros
**Esforço P · Impacto alto.** Em `Estabilizador`, trocar a contagem por limites de tempo, com um mínimo de quadros:

```python
# config
mudanca:
  tempo_para_entrar_s: 0.6     # presente por pelo menos 0,6 s e >= min_quadros
  tempo_para_sair_s: 1.5
  min_quadros_para_entrar: 2

# condição de confirmação (esboço)
estado.primeiro_visto_ts = estado.primeiro_visto_ts or agora
confirmado = (
    estado.presencas >= cfg["min_quadros_para_entrar"]
    and agora - estado.primeiro_visto_ts >= cfg["tempo_para_entrar_s"]
)
# saída:
sumiu = agora - estado.ultimo_visto_ts >= cfg["tempo_para_sair_s"]
```

Assim o comportamento deixa de depender de quantos quadros o celular consegue mandar.

#### S3 (C2, C7). Capturar mais rápido e com controle de fluxo
**Esforço P · Impacto alto** (`transmissao.ts`):
- Trocar `Math.max(250, ...)` por um mínimo pequeno, por exemplo 30 ms, e **ajustar a meta de FPS à realidade** (5 a 8 FPS é um alvo mais honesto que 24).
- Pular o quadro quando o soquete estiver congestionado:

```ts
const LIMITE_BUFFER = 256_000; // bytes
if (this.socket.bufferedAmount > LIMITE_BUFFER) {
  this.agendarProximoFrame(50);   // descarta este quadro, não acumula
  return;
}
```
- Medir `takePictureAsync` e considerar reduzir a resolução (`pictureSize` no expo-camera para Android). `quality: 0.35` já é baixo; a conversão `base64` custa tempo de JS e dá para evitar lendo o arquivo binário.

#### S4 (C3). Corrigir expiração e perda de eventos
**Esforço P-M · Impacto alto.**
1. **TTL por motivo:** `OBJETO_NOVO` e `MUDANCA_DRASTICA` com validade maior (por exemplo 10 s). Uma mensagem informativa cujo conteúdo ainda é verdadeiro não deve expirar por ter esperado uma fala.
2. **Não descartar, resumir:** quando uma nova informativa chega e há outra na fila (ou falando), **mesclar** em uma só frase em vez de descartar a anterior.
3. **Confirmar entrega:** o app envia `POST /saida/ack {frameId}` ao **começar** a falar; se uma mensagem for descartada por expiração, envia `POST /saida/descartada`. O backend mantém os eventos em `eventos_pendentes` até o ack, ou os devolve se receber o descarte. Isso troca a entrega "no máximo uma vez" por "pelo menos uma vez".

#### S5 (C6, C3). Idade medida corretamente e sem depender do relógio do celular
**Esforço P · Impacto médio.**
- No backend, registrar o instante em que o **quadro** foi recebido (`SlotFrame.publicar` guarda `ts`) e enviar na mensagem: `capturadoEm`. O TTL passa a contar da **observação**, não da criação da mensagem.
- Na entrega (`/saida`), o servidor calcula `idadeMs = (agora_servidor - capturadoEm) * 1000` e envia. O app guarda `recebidoEm = Date.now()` e usa:

```ts
// restante de validade, sem comparar relógios diferentes
const restanteMs = (msg.expiraEmMs ?? 4000) - (msg.idadeMs ?? 0);
const expiraEm = recebidoEm + restanteMs;
```

#### S6 (C8). Cooldown baseado no fim da fala
**Esforço P · Impacto baixo/médio.** Duas variantes: (a) ack do app quando a fala termina e `ultimo_ts_fala` passa a valer dali; (b) estimativa no servidor: `ultimo_ts_fala = agora + duracao_estimada`, com `duracao_estimada ≈ len(texto) × 0,07 s` (calibrar com o TTS real).

#### S7 (C4). Modelo quente e chamadas mais leves
**Esforço P · Impacto alto na primeira chamada e após ociosidade.**

```python
# skills.py, na chamada
chat(model=skill["model"], stream=True, keep_alive="30m", options=..., messages=...)

# main.py, na inicialização (em thread, sem bloquear o servidor)
def aquecer_modelo(modelo: str):
    try:
        ollama.chat(model=modelo, messages=[{"role": "user", "content": "ok"}],
                    options={"num_predict": 1}, keep_alive="30m")
    except Exception:
        logger.exception("aquecimento do modelo falhou")
```

Outros ajustes baratos:
- `num_predict` menor para o modo `atualizacao` (uma frase curta), hoje herda 120. Exige opções por modo ou uma skill própria para atualização.
- Manter o prompt de sistema **idêntico e no início** de toda chamada (o Ollama reaproveita o prefixo em cache). Reduzir seu tamanho (hoje ~20 regras) também reduz o tempo de processamento do prompt.
- Se o `num_ctx` for definido, usar o **mesmo valor** em todas as chamadas, senão o Ollama recarrega o modelo.

#### S8 (C4). Acabar com a tempestade de cancelamentos
**Esforço M · Impacto alto.**
- Não forçar **redescrição completa** a cada alerta de risco. Marcar `contexto_invalido` só se o inventário da cena mudou, e aplicar um intervalo mínimo entre redescrições (`min_intervalo_redescricao_s`).
- `cancelar_tudo()` não precisa cancelar o LLM se o risco **não usa LLM** (o texto vem de template). O motivo de cancelar é liberar CPU para o YOLO; em máquina com GPU isso não é necessário. Se mantido, **preservar a descrição inicial** (decisão já tomada: o risco não a corta) marcando a tarefa como protegida.
- Usar o parâmetro `valida` que já existe: descartar tarefas de ambiente cujo `frame_id` ficou velho antes de executá-las.

### 5.2 Mudanças de arquitetura

#### S9 (C5). Entrega por push (WebSocket) em vez de polling
**Esforço M · Impacto médio (−175 ms em média, e menos requisições).** Criar `/ws/saida` no backend, que envia a mensagem assim que ela é publicada, com reconexão e retorno ao polling como alternativa no app.

```python
# fila_saida.py: espera bloqueante com Condition
def proxima_bloqueante(self, timeout: float = 15.0):
    with self._cond:
        if not self._heap:
            self._cond.wait(timeout)
        return self.proxima()   # já remove mensagens expiradas

# rota
@router.websocket("/ws/saida")
async def ws_saida(ws: WebSocket):
    await ws.accept()
    fila = ws.app.state.deps.fila_saida
    while True:
        msg = await asyncio.to_thread(fila.proxima_bloqueante, 15.0)
        if msg is not None:
            await ws.send_json(msg.to_dict())
```

(É preciso criar um `threading.Condition` em `FilaSaida` e dar `notify()` em `publicar`.) O push também reduz a latência do alerta de risco.

#### S10 (C7). Decodificar só o quadro que será processado, fora do loop de eventos
**Esforço P-M · Impacto médio/alto com FPS alto.** Guardar os **bytes** do JPEG no slot e decodificar no loop principal apenas o último:

```python
# rota_frames.py: sem decodificação
slot.publicar_bytes(dados)               # guarda bytes + timestamp

# main.py: ao pegar o quadro
frame = decodificar_frame(slot.ultimos_bytes())
```

Alternativa mínima: `await asyncio.to_thread(captura.ingerir_frame, ...)`.

#### S11 (C3, C4). Falar frase por frase
**Esforço M · Impacto alto na percepção.**
- **No app:** quebrar o texto em frases e falar uma de cada vez (`criarNarrador` em `fala.ts` já existe, mas não é usado). Entre frases, se houver conteúdo informativo **mais novo**, descartar o resto da descrição velha. Assim, um objeto novo espera o fim de uma **frase** (2 a 3 s), não o fim de um parágrafo inteiro.
- **No backend:** publicar a primeira frase do LLM assim que ela fechar, em vez de esperar o texto completo (`skills.executar` já consome o fluxo; basta emitir cada frase com um callback `ao_frase`). A correção de posições em `skills.py` trabalha por frase e precisaria carregar seu estado de índices entre as chamadas.

#### S12 (C4). Hardware e modelos
**Esforço G · Impacto potencialmente muito alto, a confirmar com medição.**
- Verificar se o Ollama usa **GPU**. Em CPU, `qwen2.5vl:3b` gera poucos tokens por segundo e compete com o YOLO.
- Como a descrição de ambiente **não envia imagem**, um modelo **só de texto** menor (1,5B a 3B) pode servir para `descrever-ambiente` e `atualizacao`, e o `qwen2.5vl` ficaria para perguntas com imagem.
- YOLO em CPU: exportar para ONNX/OpenVINO, testar `imgsz` menor no COCO (hoje padrão de 640; os degraus já usam 480) e `a_cada_n_frames` no COCO.

---

## 6. Resultado esperado por solução

| Solução | Ataca | Efeito esperado | Risco |
|---|---|---|---|
| S1 envelhecimento + limiar de entrada | C1 | Objeto novo falado em ≤ `max_espera_evento_s` em vez de indefinido | Mais falas; calibrar para não "tagarelar" |
| S2 confirmação por tempo | C2 | Entrada ~0,6 s e saída ~1,5 s independentes do FPS | Objetos que piscam podem confirmar cedo demais |
| S3 captura/FPS + backpressure | C2, C7 | Mais quadros por segundo e sem fila escondida | Mais dados trafegados (ver seção 9) |
| S4 TTL por motivo + ack | C3 | Fim das perdas silenciosas de objetos novos | Mais um endpoint e estado |
| S5 idade correta | C6 | Mensagens velhas descartadas, sem erro de relógio | Pequena mudança de contrato |
| S6 cooldown pelo fim da fala | C8 | Menos silêncio desnecessário | Depende de ack/estimativa |
| S7 keep_alive e aquecimento | C4 | Elimina o carregamento do modelo após ociosidade | Mantém o modelo na memória |
| S8 menos cancelamentos | C4 | O LLM deixa de ser jogado fora e refeito | Reavaliar a proteção de CPU do YOLO |
| S9 push de saída | C5 | −175 ms médios; menos requisições por túnel | Reconexão e fallback |
| S10 decodificar só o último | C7 | Libera o loop de eventos e CPU | Mudança no `SlotFrame` |
| S11 fala por frase | C3, C4 | Objeto novo entra em 2 a 3 s mesmo durante descrição | Complexidade no app |
| S12 hardware/modelo | C4 | Depende da medição | Esforço e custo |

---

## 7. Instrumentação: medir antes de mexer

Hoje há logs de auditoria úteis, mas **nenhuma medição ponta a ponta**. Proposta mínima:

**Carimbos por quadro/mensagem** (backend), em segundos desde um relógio monotônico:

| Campo | Momento |
|---|---|
| `t_recebido` | quadro chegou ao WebSocket |
| `t_decodificado` | JPEG decodificado |
| `t_detectado` | fim do YOLO (COCO e degraus, separados) |
| `t_decisao` | `identificar_mudanca` terminou |
| `t_llm_ini` / `t_llm_fim` | chamada ao Ollama (e `t_primeiro_token`) |
| `t_publicado` | mensagem entrou na fila de saída |
| `t_entregue` | `/saida` ou `/ws/saida` devolveu a mensagem |

**No app:** `t_recebido_app`, `t_inicio_fala`, `t_fim_fala` (o `gerenciadorFala` já conhece esses eventos).

**Métrica principal: tempo até a fala** = `t_inicio_fala − t_captura`. Para medir de ponta a ponta é preciso o instante de captura no celular, por exemplo com um cabeçalho de 12 bytes antes do JPEG (número de sequência + timestamp) ou, no começo, usar o `t_recebido` do servidor como aproximação.

**Resumo a cada 5 s no log**, com p50 e p95 de:
- período do quadro recebido (FPS real do celular);
- tempo de YOLO por quadro;
- duração do LLM e tempo até o primeiro token;
- tempo na fila de saída;
- tempo entre "evento confirmado" e "início da fala";
- contagem de mensagens descartadas por motivo (expiração, quadro antigo, substituída).

**Sincronização de relógios:** expor o horário do servidor em `/health` e calcular o deslocamento no app, ou usar apenas durações locais (como na solução S5).

---

## 8. Plano de implementação e testes

### Fases

| Fase | Conteúdo | Critério de aceite |
|---|---|---|
| **0 — Medir** | Instrumentação da seção 7; reproduzir cenários com taxa de quadros do celular | Tabela com p50/p95 de cada etapa; FPS real conhecido |
| **1 — Ajustes rápidos** | S1, S2, S3, S5, S6, S7 | Objeto inanimado novo falado em tempo limitado; confirmação independente do FPS; sem carregamento de modelo após pausa |
| **2 — Entrega confiável** | S4, S8, S10 | Zero eventos perdidos nos cenários de teste; LLM concluindo mesmo com risco recorrente |
| **3 — Latência estrutural** | S9, S11, S12 | Metas da seção abaixo |

### Metas propostas (calibrar com a medição da fase 0)

| Cenário | Meta p95 (proposta) |
|---|---|
| Pessoa entra no campo de visão | ≤ 2,5 s até começar a falar |
| Objeto inanimado novo | ≤ 4 s |
| Risco (degrau, faca) | ≤ 1,5 s |
| Resposta a pergunta (Caminho 1, sem LLM) | ≤ 1,0 s |
| Mensagens informativas descartadas por expiração | 0 para `OBJETO_NOVO` |

### Testes reproduzíveis

O `scripts/reproduzir_video_api.py` já envia vídeo pelo WebSocket, mas na **taxa nativa do vídeo**. Acrescentar um `--fps` (por exemplo 2 e 6) para imitar o celular, e um `--jitter` opcional que simule atraso de rede.

Cenários (gravar vídeos curtos):
1. **Pessoa entra** durante o silêncio.
2. **Cadeira/micro-ondas aparece** (classe com peso baixo), em silêncio.
3. **Objeto novo durante a fala** de uma descrição longa (testa C3).
4. **Três objetos saem** de uma vez (mudança drástica, testa LLM e cooldown).
5. **Degrau persistente** por 30 s (testa a tempestade de cancelamentos, C4).
6. **Uplink lento** (limitar a banda) para ver o acúmulo de quadros (C7).

Para cada cenário, registrar o "tempo até a fala" e a contagem de descartes.

---

## 9. Riscos e trade-offs

- **Mais rapidez = mais falas.** Reduzir limiares e confirmações aumenta anúncios, e para um usuário que depende só do áudio isso cansa. Manter cooldown por classe e resumo de eventos.
- **Falso positivo na confirmação:** confirmar mais cedo (S2) aceita objetos que "piscam". Por isso o mínimo de quadros.
- **Consumo de dados:** mais FPS aumenta o tráfego. Exemplo ilustrativo: JPEG de ~100 KB a 6 FPS ≈ 2,2 GB por hora. Em apresentação remota (túnel), considerar reduzir qualidade/resolução ou limitar FPS.
- **CPU compartilhada:** em máquina sem GPU, todo ganho no LLM (menos chamadas, modelo menor) também melhora a latência de detecção e de risco.
- **Mudança de contrato:** `capturadoEm`, `idadeMs`, `ack` e `/ws/saida` exigem alterar backend e app juntos. Manter compatibilidade (campos opcionais, polling como alternativa).

---

## 10. Pontos em aberto

1. O backend roda em **CPU ou GPU**? Qual máquina?
2. Qual é o **FPS real** do app (log `Auditoria de frames mobile`) e o `capturaMediaMs`?
3. Quanto levam, em média, o **YOLO** (COCO e degraus) e a **geração do LLM** (primeiro token e total)?
4. O uso do túnel (ngrok) na apresentação será mantido? Isso muda a prioridade de S9 e S3.
5. Qual comportamento é desejado quando um **objeto novo chega durante uma descrição longa**: interromper a descrição no fim da frase, ou esperar e juntar tudo em uma fala?

---

## Anexo A — Mapa de arquivos relevantes

| Arquivo | Trecho | Relação |
|---|---|---|
| `backend/src/farol/main.py` | `:134-148`, `:158`, `:164-193`, `:313-314`, `:339-455`, `:470` | Loop principal, detecção, risco/cancelamentos, decisão de mudança, `sleep(0.05)` |
| `backend/src/farol/mudanca/identificar_mudanca.py` | `:56-64`, `:122-124`, `:204`, `:210-225` | Pontuação, redescrição por risco, acúmulo de score, cooldown |
| `backend/src/farol/mudanca/estabilizador.py` | todo | Confirmação por quadros |
| `backend/src/farol/filtro.py` | `:121-126` | Faixas de distância (sem "muito perto") |
| `backend/src/farol/fila_saida.py` | `:137`, `:143-151` | TTL a partir da criação; uma mensagem por vez |
| `backend/src/farol/fila_llm.py` | `:23`, `:111-116` | `valida` não usado; `sleep` dentro do lock |
| `backend/src/farol/skills.py` | `:139-160` | Consumo completo do fluxo; sem `keep_alive` |
| `backend/src/farol/api/rota_frames.py` | `:43`, `:147-167` | Decodificação no loop de eventos; `/saida` |
| `backend/src/farol/captura.py` | `:12-50`, `:68-73` | Slot de quadros; decodificação de todos os quadros |
| `backend/config/farol.yaml` | `:20-27`, `:39-42`, `:44-49` | Debounce, cooldown, TTLs, LLM |
| `src/services/transmissao.ts` | `:51`, `:217`, `:240`, `:264` | Meta de FPS, captura, envio sem controle de fluxo, espera mínima de 250 ms |
| `src/services/mensagens.ts` | `:29`, `:139-170` | Polling de 350 ms, expiração com relógio local |
| `src/services/gerenciadorFala.ts` | `:117-129`, `:141-144`, `:177-193` | Fila de fala, expiração, limite de fim de fala |
| `src/services/fala.ts` | `:73-89` | `criarNarrador` (fala por frase) sem uso |

## Anexo B — Parâmetros atuais que mais influenciam o atraso

| Parâmetro | Valor | Onde |
|---|---|---|
| `frames_para_entrar` / `frames_para_sair` | 3 / 5 quadros | `farol.yaml:21-22` |
| `limiar_score` | 0,6 | `farol.yaml:23` |
| `cooldown_informativo_s` | 4 s | `farol.yaml:24` |
| `expira_ms_informativa` | 4000 ms | `farol.yaml:40` |
| `a_cada_n_frames` (degraus) | 2 | `farol.yaml:10` |
| Pausa mínima entre capturas | 250 ms | `transmissao.ts:264` |
| Intervalo de polling | 350 ms | `mensagens.ts:29` |
| Pausa do loop principal | 50 ms | `main.py:470` |
| `num_predict` (descrição) | 120 tokens | `SKILL.md` |
