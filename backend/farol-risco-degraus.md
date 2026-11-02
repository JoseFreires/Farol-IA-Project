# Farol — Documento Técnico: Risco de degraus (segundo modelo YOLO)

> **Complemento** de `docs/farol-documento-tecnico.md` (a "doc principal"). Aqui só está o que muda ou é novo para integrar o modelo treinado de **degrau** ao YOLO26n (COCO), inclusive o efeito dele na descrição, nas perguntas e na detecção de mudança. O que não for citado segue a doc principal. Referências: seção 7.2 (detecção), 7.3 (filtro), 7.8 (risco), 6.1 (contrato `Deteccao`), 8 (ciclo), 9 (YAML).

---

## 1. Decisão: dois modelos em paralelo

| | Dois modelos (adotado) | Um modelo com 81 classes |
|---|---|---|
| Treino | Nenhum além do que já foi feito | Exige COCO completo (~20 GB, 118 mil imagens) + dataset de degraus, em GPU |
| Risco de regressão nas classes COCO | Nenhum | Alto: a camada de classes é recriada; treinar só com degraus apaga o resto, e imagens de escada sem rótulo dos outros objetos ensinam o modelo a ignorá-los |
| Custo por frame | A etapa de detecção leva ~2× (dois modelos nano). **Medir** (seção 6) | 1× |
| Evolução | Trocar ou retreinar um modelo sem tocar no outro | Qualquer ajuste retreina tudo |
| Encaixe na arquitetura | O risco já é um caminho independente (princípio da seção 2 da doc principal) | Mistura percepção geral e risco |

**Consequência de projeto:** as duas saídas YOLO são **unidas em uma única base de objetos** (`ObjetoTratado`) que alimenta o Gemma, as perguntas e a detecção de mudança. O degrau entra nessa base marcado como **risco**. Em paralelo, o caminho de risco lê o JSON **bruto** dos dois modelos e dispara o alerta por template, sem esperar o Gemma (princípio 4 do prompt do copiloto).

O modelo de degrau só produz detecções quando há degrau no frame; na maior parte do tempo a base é idêntica à de antes.

Caminho futuro, se um dia for necessário um modelo único: ver Apêndice A.

---

## 2. Arquitetura

```
frame ─┬─► DetectorCoco    (YOLO26n, track, todo frame)  ──┐
       └─► DetectorDegraus (degrau.pt, predict, a cada N) ─┴─► bruto: list[Deteccao]
                                                              │
                         ┌────────────────────────────────────┴───────────────┐
                         ▼                                                    ▼
          identificar_risco (bruto: coco + degrau)              montar_base (filtro_normal + filtro_degraus)
          └─► alerta por template (CRITICA, sem LLM)                          │
                                                                   estabilizador (chave sintética p/ degrau)
                                                                              │
                                              base unificada: tuple[ObjetoTratado]  (degrau com risco=True)
                                              ├─► identificar_mudanca  (ignora objetos de risco)
                                              ├─► descrever-ambiente   (Gemma; vê todos, com marcação [risco])
                                              └─► perguntas (Caminho 1 em Python / Caminho 2 com Gemma)
```

Regras:

1. Os dois detectores recebem **o mesmo frame** e produzem `Deteccao` com o mesmo `frame_id`.
2. As classes não se sobrepõem (COCO × degrau): **não há deduplicação** entre modelos.
3. O campo `origem` (`"coco"` | `"degraus"`) identifica o detector de cada detecção.
4. **Só o COCO usa tracker.** Cada `track()` mantém estado próprio; compartilhar IDs entre modelos causaria colisão. Degrau sai com `id_track=None` e é estabilizado por chave sintética (5.5).
5. O detector de degrau **nunca** chama o LLM.
6. **Há uma única base de objetos** para o Gemma (a "base unificada"). O degrau é o único objeto com `risco=True`.
7. **O alerta de risco nunca espera o Gemma.** Descrição e alerta são mensagens diferentes (5.9 explica como evitar repetição).

---

## 3. Contrato

`Deteccao` (doc principal, 6.1): acrescente ao final, com default:

```python
origem: str = "coco"      # "coco" | "degraus"
```

`ObjetoTratado` (doc principal, 6.2): acrescente ao final, com default (o código existente só acessa `classe_yolo`, `classe_pt`, `horizontal`, `distancia`):

```python
origem: str = "coco"      # "coco" | "degraus"
risco: bool = False       # True para objetos que são perigo (degrau)
```

O objeto de degrau carrega `classe_yolo="degrau"` e `classe_pt` vinda de `nomes_pt` (o Farol fala **"escada"**, porque a caixa cobre a escada inteira). Os campos `bbox`, `frame_id`, `horizontal`, `vertical`, `distancia` e `conf` são os mesmos dos demais objetos.

---

## 4. Configuração (`config/farol.yaml`)

Todas as chaves novas têm default no código; se `yolo_degraus` estiver ausente ou `habilitado: false`, o sistema roda só com COCO.

```yaml
yolo:
  modelo: yolo26n.pt
  conf_deteccao: 0.25

yolo_degraus:
  habilitado: true
  modelo: models/degraus.pt       # pesos treinados
  conf_deteccao: 0.35             # calibrar com gravações reais (fonte de falso positivo)
  imgsz: 480                      # menor que o padrão para economizar tempo; validar no seu modelo
  a_cada_n_frames: 2              # 1 = todo frame; reutiliza o último resultado entre as execuções
  classes: [degrau]               # nome da classe em model.names (classe única; sem subida/descida)
  nomes_pt: { degrau: "escada" }  # como o Farol FALA a classe (a caixa cobre a escada inteira)
  margem_recorte: 0.25            # recorte para o Gemma em perguntas (padrão dos demais: 0.15)

risco:
  classes_criticas: [degrau]      # ativa o ramo de gradação por área (prompt do copiloto, 5.5)
  area_aviso: 0.10                # calibrar
  area_atencao: 0.25              # calibrar
```

`area_aviso` e `area_atencao` são **pontos de partida**, não valores medidos. Uma escada longa pode ocupar bastante área mesmo ainda longe; a calibração real é da Fase D3.

**Atenção a dois limiares diferentes:** o degrau **entra na base** (e portanto na descrição e nas perguntas) assim que `area_rel >= filtro.area_min`; o **alerta** só dispara a partir de `area_aviso`. Um degrau pequeno e distante aparece na descrição ("atenção, há uma escada à direita") sem gerar alerta falado.

---

## 5. Módulos

### 5.1 `deteccao.py`

Substitui a função única `detectar` da doc principal (7.2) por dois detectores e um agregador. Modelos carregados **uma vez**, nunca por chamada.

```python
from dataclasses import replace
from ultralytics import YOLO
from src.farol.contratos import Deteccao


def _converter(res, frame_id, frame, origem, com_id) -> list[Deteccao]:
    h, w = frame.shape[:2]
    n = len(res.boxes)
    ids = (res.boxes.id.int().tolist()
           if com_id and res.boxes.id is not None else [None] * n)
    out = []
    for box, tid in zip(res.boxes, ids):
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        out.append(Deteccao(frame_id, tid, res.names[int(box.cls)], float(box.conf),
                            x1, y1, x2, y2, w, h, origem=origem))
    return out


class DetectorCoco:
    def __init__(self, cfg: dict):
        self.modelo = YOLO(cfg["modelo"])
        self.conf = cfg.get("conf_deteccao", 0.25)

    def detectar(self, frame_id, frame) -> list[Deteccao]:
        res = self.modelo.track(frame, persist=True, conf=self.conf, verbose=False)[0]
        return _converter(res, frame_id, frame, "coco", com_id=True)


class DetectorDegraus:
    def __init__(self, cfg: dict):
        self.modelo = YOLO(cfg["modelo"])
        self.conf = cfg.get("conf_deteccao", 0.35)
        self.imgsz = cfg.get("imgsz")                  # None = padrão do modelo
        self.cada_n = max(1, cfg.get("a_cada_n_frames", 1))
        self.classes = set(cfg["classes"])
        desconhecidas = self.classes - set(self.modelo.names.values())
        if desconhecidas:                              # falha cedo, com mensagem clara
            raise ValueError(f"Classes ausentes em {cfg['modelo']}: {sorted(desconhecidas)}; "
                             f"o modelo tem {sorted(self.modelo.names.values())}")
        self._contador = 0
        self._ultimo: list[Deteccao] = []

    def detectar(self, frame_id, frame) -> list[Deteccao]:
        if self._contador % self.cada_n == 0:
            kw = {"conf": self.conf, "verbose": False}
            if self.imgsz:
                kw["imgsz"] = self.imgsz
            res = self.modelo.predict(frame, **kw)[0]
            self._ultimo = [d for d in _converter(res, frame_id, frame, "degraus", com_id=False)
                            if d.classe in self.classes]
        self._contador += 1
        return [replace(d, frame_id=frame_id) for d in self._ultimo]   # reaproveita entre execuções


class Percepcao:
    """Ponto único que a T_percepcao chama."""
    def __init__(self, coco: DetectorCoco, degraus: DetectorDegraus | None):
        self.coco, self.degraus = coco, degraus

    def detectar(self, frame_id, frame) -> list[Deteccao]:
        bruto = self.coco.detectar(frame_id, frame)
        if self.degraus is not None:
            bruto += self.degraus.detectar(frame_id, frame)
        return bruto
```

Observações:
- `a_cada_n_frames > 1` reaproveita as caixas da última execução. Como o usuário se move, as caixas ficam levemente defasadas; com N=2 a defasagem é de um frame. Se a medição mostrar atraso perceptível, volte a `1` ou reduza `imgsz`.
- Quando uma execução **não** encontra degrau, `_ultimo` é esvaziado na hora (nada de "degrau fantasma").
- Quem decide se `DetectorDegraus` existe é o `main.py` (seção 5.4).

### 5.2 `filtro.py`: base unificada

```python
def filtro_degraus(bruto_degraus, cfg_filtro, cfg_degraus) -> tuple[ObjetoTratado, ...]:
    # origem == "degraus": area_rel >= filtro.area_min; classe_pt via nomes_pt;
    # risco=True; id_track=None; mesmos horizontal/vertical/distancia dos demais.
    ...

def montar_base(bruto, cfg_filtro, cfg_degraus) -> tuple[ObjetoTratado, ...]:
    coco = filtro_normal([d for d in bruto if d.origem == "coco"], cfg_filtro)
    degraus = filtro_degraus([d for d in bruto if d.origem == "degraus"], cfg_filtro, cfg_degraus)
    return degraus + coco          # risco primeiro
```

- `filtro_normal` passa a tratar **só** `origem == "coco"` (o limite `max_objetos` vale **só** para ele).
- Objetos de degrau **nunca** são cortados por `max_objetos`: perigo não pode ficar de fora por excesso de cadeiras.
- A base unificada é o que vai para `estabilizador`, `ultimo_json`, `descrever-ambiente` e perguntas.

### 5.3 `risco/identificar_risco.py`

Estende a função pura (prompt do copiloto, 5.5). Ela lê o **bruto** (as duas origens). Para cada `Deteccao`:

- `origem == "coco"` e `classe in risco.classes`: regra atual (primeiro avistamento, `conf_min`, nível por distância).
- `origem == "degraus"` (ou `classe in risco.classes_criticas`):
  - `area_rel > area_atencao` → `ATENCAO`;
  - `area_rel > area_aviso` → `AVISO`;
  - abaixo disso → ignora (não alerta; o objeto continua na base).
- `chave` do trigger: `f"{classe}:{horizontal}"` (sem tracker). `fator_aproximacao` e `repetir_apos_s` funcionam como na doc principal. Girar o corpo muda `horizontal` e gera nova chave; é um alerta a mais, aceitável para segurança.
- Texto por template, sem LLM, usando `nomes_pt` com fallback em `CLASSES_PT`:
  - `ATENCAO`: `"Atenção! escada {horizontal}, {distancia}."`
  - `AVISO`: `"Aviso: escada {horizontal}, {distancia}."`
- Os alertas seguem o fluxo de risco da doc principal: `registrar_alerta`, `fila_llm.cancelar_tudo()`, `Prioridade.CRITICA`, `interrompe=True`, `contexto_invalido=True`.

### 5.4 `main.py` (inicialização)

```python
coco = DetectorCoco(cfg["yolo"])
degraus = None
cfg_d = cfg.get("yolo_degraus", {})
if cfg_d.get("habilitado", False):
    try:
        degraus = DetectorDegraus(cfg_d)
    except Exception as exc:                        # arquivo ausente, classe errada, etc.
        log.exception("Detector de degraus indisponível")
        fila_saida.publicar(msg_erro("Detector de degraus indisponível."))
percepcao = Percepcao(coco, degraus)
```

Política: se o detector de degraus **não carregar**, o Farol segue com COCO, mas **fala o erro** (nunca em silêncio: princípio de falha explícita da doc principal). Em nenhum caso o app deve parecer "protegido contra escadas" sem estar.

---

### 5.5 `mudanca/estabilizador.py`

O estabilizador do prompt do copiloto (5.4) ignora detecções sem `id_track`. O degrau é a exceção, com **chave sintética**:

- chave do degrau: `f"degrau:{horizontal}"` (com sufixo de ordem se houver duas caixas na mesma região);
- entra na base estável após `frames_para_entrar` frames consecutivos e sai após `frames_para_sair`, como os demais;
- histerese de `horizontal`/`distancia` igual à dos outros objetos.

Como `DetectorDegraus` reaproveita o resultado entre execuções (`a_cada_n_frames`), os "frames consecutivos" são contados por frame do ciclo, não por inferência.

### 5.6 `mudanca/identificar_mudanca.py`

Regra: **objeto de risco não participa da detecção de mudança.**

- No início da função, descarte `o.risco` **dos dois lados** (`objetos_atuais` e `estado_sessao.ultimo_json`). Sem filtrar os dois, o degrau aparece como `ENTROU`/`SAIU` falsos, porque `ultimo_json` guarda a base completa.
- Efeitos desejados:
  - degrau **entra** no campo de visão → quem avisa é o **risco** (template, `CRITICA`). Não vira evento para o Gemma, para não falar duas vezes;
  - degrau **sai** → **nada é comunicado** (igual aos demais objetos);
  - degrau permanece → silêncio (o `trigger` só repete com aproximação ×1,3 ou após `repetir_apos_s`).
- `total_anteriores` e `fracao_drastica` passam a considerar só objetos sem risco.

### 5.7 `contexto.py` e skills

`texto_objetos(tratados, alertados)` marca os objetos de risco:

```
cadeira: à esquerda, perto (confiança 0,91)
escada: à direita, perto (confiança 0,87) [risco]
escada: à direita, perto (confiança 0,87) [risco, já avisado]
```

`já avisado` = a chave `f"{classe_yolo}:{horizontal}"` está em `estado_risco.alertados`. `texto_eventos` nunca contém objetos de risco (5.6).

Acrescente estas regras ao `## Sistema` das skills (os `SKILL.md` continuam sendo o único lugar de prompt; **nenhum texto de prompt vai para o `.py`**):

`skills/descrever-ambiente/SKILL.md`:

```
- Objetos marcados [risco] são perigos de piso (ex.: escada). Mencione-os sempre, por último e em destaque: "atenção, há uma escada à sua direita".
- Se o objeto estiver marcado [risco, já avisado], mencione-o de forma breve ("e há uma escada à sua direita"), sem repetir "atenção".
- Nunca diga quantos degraus tem a escada nem o tamanho dela: a lista só informa onde está.
- Em atualizações, não cite objetos [risco] que não estejam em "O que mudou".
```

`skills/responder-pergunta/SKILL.md`:

```
- Objetos marcados [risco] (ex.: escada) vêm de um detector de caixa única: a caixa cobre a escada inteira, não cada degrau.
- Para quantidade de degraus: conte só os degraus nítidos no recorte e diga "cerca de N" se houver dúvida; se não conseguir contar com segurança, diga isso.
- Para tamanho ou altura: dê só estimativa qualitativa (ex.: "parece curta", "parece longa"). Nunca invente medidas em metros ou centímetros.
```

Exemplo do resultado esperado, com a escada ainda **sem** alerta falado (abaixo de `area_aviso`):
"Há uma geladeira e uma cadeira à sua esquerda. Atenção, há uma escada à sua direita."

### 5.8 Perguntas: `vocabulario.py`, `roteador.py`, `fluxo_simples.py`

Como o degrau está na base unificada, o **Caminho 1 funciona sem mudar a lógica**; só precisa do vocabulário e de duas regras de roteamento.

- `VOCAB`: `"escada": "degrau"` e `"degrau": "degrau"`. `ARTIGO`: `escada → "a"`, `degrau → "o"`. A resposta usa o termo que o usuário falou ("Sim, há uma escada à direita, perto.").
- **Caminho 1 (Python, sem LLM):** "tem escada?", "onde está a escada?", "quantas escadas?" (conta caixas).
- **Forçar Caminho 2 (Gemma)**, em `classificar_intencao`/`rotear_pergunta`:
  - pergunta de contagem cujo termo é **`degrau`** ("quantos degraus tem?"): a caixa não informa degraus individuais. Intenção `ATRIBUTO`;
  - novos termos de `ATRIBUTO`: `tamanho`, `altura`, `alta`, `alto`, `largura`, `comprimento`, `grande`, `pequena`.
- No Caminho 2, o recorte usa `yolo_degraus.margem_recorte` (0,25) quando o alvo é `degrau`, para não cortar degraus nas bordas da caixa.
- Sem degrau na base: "Não detectei escada agora. Tente girar a câmera." (a mensagem honesta de sempre).

### 5.9 Os três cenários, de ponta a ponta

| Cenário | O que acontece | Quem fala | Gemma? |
|---|---|---|---|
| **1. Descrição inicial (ou drástica) com escada** | O risco lê o bruto e, se `area_rel > area_aviso`, dispara o alerta por template na hora. Em seguida a descrição sai com a base completa. Abaixo de `area_aviso` não há alerta, e a descrição traz "atenção, há uma escada…". | Template (alerta) + Gemma (descrição) | Sim (só na descrição) |
| **2a. Pergunta local** ("tem escada?", "onde?") | Caminho 1 em Python sobre a base unificada | Template | Não |
| **2b. Pergunta de quantidade de degraus ou tamanho** | Caminho 2 com recorte da caixa | Gemma | Sim |
| **3. Mudança de ambiente** | Entrou: o risco avisa por template. Saiu: nada. Ficou: nada. | Template (só na entrada) | Não |

Cuidados:
- **O alerta cancela a fila do LLM.** Se o degrau for visto no frame 0, o alerta sai primeiro; a descrição inicial é (re)enfileirada em seguida. `descricao_inicial_feita` só vira `True` quando a descrição for **gerada**, nunca ao ser cancelada.
- **Repetição alerta × descrição.** Para o mesmo perigo não ser dito duas vezes, a descrição usa a marca `[risco, já avisado]` (5.7) e menciona a escada sem "atenção".
- **Contagem de degraus pelo Gemma é aproximada.** Imagem recortada ajuda, mas é a parte menos confiável do fluxo; a skill manda dizer quando não consegue contar.

---

## 6. Desempenho: medir antes de otimizar

Não há número prometido aqui; ele depende da sua máquina. Estenda `scripts/medir_yolo.py` (Fase 1) para:

- aceitar `--modelo coco` e `--modelo degraus`, com os mesmos vídeos de `gravacoes/`;
- imprimir **p50 e p95 de latência por modelo** e o **tempo total da etapa de detecção** com os dois;
- registrar o FPS efetivo do ciclo (sem LLM) com `a_cada_n_frames` em 1, 2 e 3.

Critério de aceite: o ciclo completo sem LLM **não pode ficar mais lento que a cadência de frames que o app envia** (se atrasar, o slot único descarta frames, o que é seguro mas reduz a reação ao risco).

Alavancas, em ordem de simplicidade:
1. `a_cada_n_frames` e `imgsz` do modelo de degraus.
2. Em CPU: exportar para ONNX/OpenVINO. Ganho depende do hardware; **confirme medindo**.
3. Em GPU: meia precisão.
4. Só se necessário: rodar os dois detectores em threads separadas (`ThreadPoolExecutor(2)`). Mantenha sequencial até a medição provar o contrário.

---

## 7. Limitações (devem estar no texto do app)

- O modelo cobre **degrau**, como **classe única** e **uma caixa por escada**: não diferencia subida de descida e não informa a quantidade nem a altura dos degraus. O alerta é neutro quanto à direção ("escada à frente"); quantidade e tamanho só saem por pergunta, via Gemma, e de forma aproximada. Meio-fio, desníveis, buracos, poças e piso molhado **não** estão cobertos (continuam na Fase B da doc principal).
- Pouca luz, escadas rolantes, rampas e escadas muito inclinadas ou parcialmente visíveis podem falhar. Falso negativo é possível.
- O Farol é auxílio e **nunca** substitui bengala ou cão-guia.

---

## 8. Testes

Sem pesos reais, com detectores falsos:

- `test_detector_degraus.py`: `a_cada_n_frames=2` executa a inferência nos frames 0, 2, 4 e reaproveita nos ímpares; execução sem detecção esvazia o cache; classe inexistente em `model.names` levanta `ValueError` com a lista de classes; `frame_id` do reaproveitado é o do frame atual.
- `test_percepcao.py`: com `degraus=None` funciona só com COCO; com os dois, soma as listas e preserva `origem`.
- `test_base_unificada.py`: `montar_base` põe o degrau primeiro com `risco=True` e `classe_pt="escada"`; `max_objetos` não corta o degrau; `area_rel < filtro.area_min` fica de fora.
- `test_estabilizador.py` (acréscimo): degrau sem `id_track` entra após `frames_para_entrar` e sai após `frames_para_sair` pela chave `degrau:{horizontal}`.
- `test_identificar_mudanca.py` (acréscimo): degrau entrando **não** gera evento nem `deve_falar`; degrau saindo **não** gera evento; com 3 objetos COCO + 1 degrau, a fração drástica ignora o degrau.
- `test_contexto.py`: `texto_objetos` gera `[risco]` e `[risco, já avisado]` conforme `alertados`; `texto_eventos` nunca traz objeto de risco.
- `test_risco_degraus.py`: gradação por `area_aviso`/`area_atencao`; abaixo do limiar não alerta; texto usa `nomes_pt` ("escada") e **não** menciona subida/descida; chave `classe:horizontal`; trigger repete só com aproximação ×1,3 ou após `repetir_apos_s`.
- `test_pergunta.py` (acréscimo): "tem escada?" e "onde está a escada?" → Caminho 1; "quantas escadas?" → Caminho 1; "quantos degraus tem?" → Caminho 2; "qual o tamanho da escada?" → Caminho 2; sem degrau na base → "Não detectei escada agora…".
- `test_cenarios_degrau.py` (ciclo completo com detectores e Gemma falsos): (1) degrau no frame 0 → alerta `CRITICA` primeiro, descrição depois com `[risco, já avisado]`; (3) degrau entrando depois → só alerta; saindo → silêncio.
- `test_main_init.py`: modelo ausente → `msg_erro` publicada **e** ciclo segue com COCO.
- Opcional, marcado `@pytest.mark.modelo` (pulado se `models/degraus.pt` não existir): carrega os pesos reais e detecta degrau numa imagem fixa de `tests/dados/`.

---

## 9. Plano de implementação

| Fase | Entrega | Aceite |
|---|---|---|
| **D1** | Medição dos dois modelos (6) e escolha inicial de `imgsz`/`a_cada_n_frames` | Tabela p50/p95 por modelo e FPS do ciclo, com gravações reais (com e sem escada) |
| **D2** | `deteccao.py` (3 classes), campo `origem`, `main.py` com falha explícita, YAML | Testes 5.1 e `test_main_init` verdes; COCO sem regressão |
| **D3** | Risco de degrau, calibração de `conf_deteccao`, `area_aviso`, `area_atencao` | Em vídeos reais: alerta antes do primeiro degrau; sem alerta em cenas sem escada; sem repetição sem aproximação |
| **D3b** | Base unificada (5.2), estabilizador (5.5), mudança (5.6), contexto e skills (5.7), perguntas (5.8) | Testes `test_base_unificada`, `test_contexto`, `test_pergunta`, `test_cenarios_degrau` verdes; cenários 1 a 3 corretos com Gemma falso |
| **D4** | Ponta a ponta com app: frames por `/ws/frames`, alerta por `/ws` cortando fala em andamento, Gemma real | Alerta falado interrompe a descrição; descrição seguinte cita a escada sem repetir "atenção"; "quantos degraus?" responde ou admite que não consegue contar |

Esta trilha entra na Fase 8 (Risco) do plano principal; D3b depende das Fases 6 e 7.

---

## 10. Decisões

**Fechadas**
1. **Dois modelos em paralelo**, só COCO com tracker.
2. **Classe única `degrau`**, sem subida/descida. O Farol fala **"escada"** (a caixa cobre a escada inteira); alterável em `nomes_pt`.
3. **Uma base unificada** de objetos para o Gemma, com degrau marcado `risco=True`.
4. **Mudança:** entrada de degrau aciona o aviso de risco; saída não é comunicada.
5. **Perguntas:** localizar, existir e contar escadas em Python; quantidade de degraus e tamanho no Gemma, com recorte.

**Em aberto (calibrar na D3/D4)**
1. **Alerta + descrição no mesmo momento:** padrão adotado é falar o alerta na hora e a descrição citar a escada brevemente (`[risco, já avisado]`). Se ficar repetitivo, uma alternativa é suprimir o alerta durante a descrição inicial, **ao custo de a escada esperar o Gemma**; não recomendado por segurança.
2. **Gating do detector:** entendi que "acionado em cenários específicos" significa que ele só **produz saída** quando há degrau. Ele continua **rodando** a cada `a_cada_n_frames`, pois não há como saber que há escada sem inferir. Se a intenção era ligá-lo só em certos ambientes (ex.: modo externo), basta alternar `yolo_degraus.habilitado`.
3. **Limiar por área × por distância:** a área da caixa é uma aproximação de proximidade. Se a calibração mostrar muita variação, avaliar a altura relativa da caixa ou a posição vertical (`vertical()` da doc 7.3).
4. **Várias escadas na mesma região** compartilham a chave `degrau:{horizontal}` (com sufixo de ordem): "quantas escadas?" pode subestimar.
5. **Confiabilidade da contagem de degraus pelo Gemma** (`gemma3:4b`): validar na D4 com fotos reais; se for ruim, a skill já manda admitir a incerteza.

---

## Apêndice A — Se um dia quiser um modelo único (não recomendado agora)

1. Rodar o YOLO26n COCO nas imagens de escada do seu dataset e gerar **rótulos automáticos** das classes COCO (pseudo-rótulos), com limiar alto (≥0,5).
2. Juntar esses rótulos aos rótulos manuais de degrau (classe 80).
3. Misturar com um **subconjunto** do COCO (por exemplo, 10–20 mil imagens) para preservar as classes originais.
4. Treinar a partir de `yolo26n.pt` com `nc: 81`.
5. Comparar **mAP no COCO val** com o modelo original: se cair de forma relevante, o modelo único não vale a troca.

Custo: tempo de GPU, curadoria dos pseudo-rótulos e revalidação das classes. Só faz sentido se o tempo de inferência dos dois modelos se provar inviável na máquina-alvo.
