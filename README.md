# 🔦 Farol

> Tecnologia assistiva baseada em visão computacional e IA generativa para ampliar a autonomia, a segurança e a percepção ambiental de pessoas com deficiência visual.

Projeto desenvolvido na **Fatec Zona Sul** para a disciplina de **Inteligência Artificial** (2º semestre de 2026), sob orientação do **Prof. Edson Ceroni**.

> ⚠️ **Aviso:** o Farol é um auxílio e **não substitui** bengala ou cão-guia.

---

## 📑 Sumário

- [Sobre o projeto](#-sobre-o-projeto)
- [Como funciona](#-como-funciona)
- [Arquitetura](#-arquitetura)
- [Tecnologias](#-tecnologias)
- [Elementos de IA utilizados](#-elementos-de-ia-utilizados)
- [Regras de decisão](#-regras-de-decisão)
- [Árvore de decisão](#-árvore-de-decisão)
- [Quadro negro (estado da sessão)](#-quadro-negro-estado-da-sessão)
- [Modelo de detecção de escadas](#-modelo-de-detecção-de-escadas)
- [Acessibilidade da interface](#-acessibilidade-da-interface)
- [Requisitos e compatibilidade](#-requisitos-e-compatibilidade)
- [Instalação e execução](#-instalação-e-execução)
- [Testes](#-testes)
- [Equipe](#-equipe)

---

## 🎯 Sobre o projeto

O **Farol** identifica objetos do cotidiano ao redor do usuário, informa **onde** eles estão (esquerda, frente, direita) e **a que distância aproximada**, alerta sobre situações de risco e responde, por voz, perguntas sobre o ambiente.

**Domínio de conhecimento:** percepção do ambiente para pessoas com deficiência visual (baixa visão a cegueira), abrangendo:

- identificação de objetos do cotidiano (80 classes COCO + escadas, treinadas pelo grupo);
- posição em relação ao usuário e distância aproximada;
- reconhecimento de situações de risco (veículos, objetos cortantes e escadas) e de mudanças no ambiente;
- interpretação de perguntas em português sobre o que está ao redor.

---

## ⚙️ Como funciona

O Farol é formado por um **aplicativo Android** (React Native/Expo) e um **servidor em Python** (FastAPI) que roda em um computador **na mesma rede Wi-Fi**.

1. **Captura:** o app transmite continuamente os quadros da câmera para a API.
2. **Detecção:** cada quadro passa por dois modelos YOLO: o `yolo26n` pré-treinado (objetos do cotidiano, base COCO) e um modelo treinado pelo grupo para detectar escadas.
3. **Regras:** o código filtra as detecções por confiança e tamanho e calcula a posição (esquerda, frente, direita) e a distância aproximada de cada objeto.
4. **Risco:** veículos, faca, tesoura e escadas geram alerta imediato (**"Atenção!"** ou **"Aviso"**), com prioridade máxima, interrompendo as outras falas e **sem depender da IA generativa**.
5. **Descrição:** a descrição inicial do ambiente e as mudanças relevantes são narradas pelo modelo `qwen2.5vl:3b`, executado localmente pelo Ollama, que **só pode citar os objetos detectados pelo YOLO**.
6. **Perguntas:** o usuário pergunta por voz (reconhecimento offline com Vosk). Perguntas simples ("tem...?", "onde está...?", "quantos...?") são respondidas por regras; cor, estado ou texto escrito vão para o modelo junto com a imagem.
7. **Saída:** as respostas são faladas (`expo-speech`) em fila de prioridade (**risco > resposta > descrição**), com vibração de confirmação.

---

## 🏗️ Arquitetura

```
┌──────────────────────┐        Wi-Fi         ┌─────────────────────────────────────┐
│  App Android         │ ───── quadros ─────▶ │  Servidor Python (FastAPI/Uvicorn)  │
│  React Native / Expo │                      │                                     │
│                      │                      │  YOLO (COCO) + YOLO (escadas)       │
│  • Câmera            │                      │            │                        │
│  • Vosk (voz offline)│                      │            ▼                        │
│  • expo-speech (TTS) │ ◀──── respostas ──── │  Motor de regras (config/farol.yaml)│
│  • expo-haptics      │                      │            │                        │
└──────────────────────┘                      │            ▼                        │
                                              │  Ollama · qwen2.5vl:3b (local)      │
                                              └─────────────────────────────────────┘
```

---

## 🧰 Tecnologias

**Aplicativo (Android)**

- React e React Native
- Expo (Expo Dev Client / EAS Build, SDK 58)
- `expo-camera`
- `react-native-vosk` (reconhecimento de voz offline)
- `expo-speech` (síntese de voz)
- `expo-haptics` (vibração)

**Servidor**

- Python 3.12
- FastAPI + Uvicorn
- OpenCV
- YOLO / Ultralytics
- Ollama (Python) com o modelo `qwen2.5vl:3b`

**Ferramentas de desenvolvimento**

- Visual Studio Code 1.144.1
- Postman 12.33.4
- Node.js

---

## 🧠 Elementos de IA utilizados

| Elemento | Como é aplicado no Farol |
| --- | --- |
| **Poda** | Descarta detecções com confiança < 0,70 ou área < 1% do quadro e limita a fala a 8 objetos, eliminando o que é irrelevante antes de qualquer decisão. |
| **Mecanismo de inferência** | Motor de regras em Python (risco, mudança no ambiente e roteador de perguntas) que aplica as regras sobre os fatos detectados para decidir o que falar e quando. |
| **Encadeamento para frente** | Parte dos fatos para a conclusão: detecção → regra → ação. Ex.: faca com confiança ≥ 0,70 e perto → alerta "Atenção!". |
| **Encadeamento para trás** | Nas perguntas, parte do objetivo ("tem uma cadeira?") e procura nos fatos detectados se ele é sustentado; se não for, responde que não detectou e pede para girar a câmera. |
| **Sistema especialista** | O conhecimento sobre o que é perigoso ou relevante para uma pessoa com deficiência visual fica em uma base separada (`config/farol.yaml`), aplicada pelo motor de regras. |
| **Sistema heurístico** | A distância é estimada pela área da caixa detectada; as mudanças recebem um score com pesos por classe e distância (limiar 0,6); o alerta é repetido se o objeto crescer 1,3x (aproximação). |
| **Linguagem natural** | Reconhecimento de voz (Vosk), classificação da intenção da pergunta (contar, existe, localizar, atributo, geral), geração da resposta pelo modelo e síntese de voz em português. |
| **Aprendizado supervisionado** | YOLO (`yolo26n`) treinado pelo grupo com imagens rotuladas de escadas. |
| **Banco de conhecimentos** | `farol.yaml` (limiares, pesos, classes de risco), dicionário de classes em português, vocabulário das perguntas e os prompts das skills (`SKILL.md`). |
| **Reconhecimento de padrão** | Detecção de objetos nas imagens pelas redes YOLO. |
| **IA generativa** | Modelo de visão e linguagem `qwen2.5vl:3b` (Ollama) gera as descrições e respostas em português, restrito aos objetos detectados. |

---

## 📏 Regras de decisão

O sistema possui **41 regras** de decisão:

| Grupo | Qtde. |
| --- | :---: |
| Filtro de detecções | 4 |
| Posição (3) e distância (3) | 6 |
| Identificação de risco | 8 |
| Repetição de alerta | 3 |
| Intenção da pergunta | 5 |
| Roteador de perguntas | 4 |
| Mudança no ambiente | 6 |
| Validade das mensagens | 5 |
| **Total** | **41** |

---

## 🌳 Árvore de decisão

```
QUADRO DA CÂMERA
│
├─ Objeto de risco com conf. >= 0,70?
│  ├─ Sim, perto (ou escada > 25% da tela)
│  │   └─ "Atenção!" (interrompe a fala)
│  ├─ Sim, longe (ou escada 10-25%)
│  │   └─ "Aviso"
│  └─ Já avisado? Só repete se aproximou
│     1,3x ou se passaram 10 s
│
├─ Descrição inicial já feita?
│  └─ Não -> IA descreve o ambiente
│
└─ Mudança: score >= 0,6 (ou espera > 2,5 s)?
   ├─ Não -> silêncio
   ├─ Drástica (>= 70%) -> IA descreve de novo
   └─ Pequena -> anuncia o que entrou/saiu

PERGUNTA POR VOZ
│
├─ Descrição inicial feita?
│  └─ Não -> "Aguarde a primeira descrição"
├─ Contar degraus?
│  └─ "Não consigo informar a quantidade"
├─ Atributo (cor, estado, texto) ou geral?
│  └─ IA responde com a imagem
└─ Contar / existe / localizar?
   ├─ Objeto conhecido -> resposta por regra
   └─ Senão -> IA responde com a imagem
```

---

## 🗂️ Quadro negro (estado da sessão)

O estado da sessão funciona como um **quadro negro**: uma área compartilhada onde os módulos leem e escrevem.

- **Escrevem:**
  - a percepção (YOLO) registra os objetos detectados com classe, posição e distância;
  - o módulo de risco registra os alertas já emitidos (área e horário);
  - o módulo de mudança registra eventos pendentes, score e objetos já anunciados;
  - a descrição já falada fica guardada.
- **Leem:** risco, mudança e roteador de perguntas consultam os objetos atuais para decidir.
- **Controle:** duas filas com prioridade organizam o acesso:
  - **FilaLLM:** único consumidor do modelo, com suporte a cancelamento;
  - **FilaSaida:** controla prioridade e tempo de validade de cada mensagem falada.

---

## 🪜 Modelo de detecção de escadas

Modelo `yolo26n` treinado pelo grupo com imagens rotuladas de escadas (aprendizado supervisionado):

| Parâmetro | Valor |
| --- | --- |
| Imagens de treino | 159 |
| Imagens de validação | 49 |
| Épocas | 100 |
| **Precisão** | **0,887** |
| **Recall** | **0,540** |
| **mAP50** | **0,589** |

---

## ♿ Acessibilidade da interface

A interface foi pensada para quem não enxerga:

- interação principal **por voz** (perguntas reconhecidas offline pelo Vosk);
- respostas **faladas**, com velocidade e tom ajustáveis;
- **fila de prioridade** para os alertas (risco sempre primeiro);
- **vibração** de confirmação e de erro;
- **tema escuro de alto contraste**;
- tela de configurações.

---

## 💻 Requisitos e compatibilidade

- **App:** Android 7.0 ou superior.
- **Servidor:** computador com Python 3.12 e Ollama instalados, na **mesma rede Wi-Fi** do celular.
- Modelo de linguagem: `qwen2.5vl:3b` (executado localmente via Ollama).

---

## 🚀 Instalação e execução

> ℹ️ Ajuste os nomes de pastas e arquivos abaixo conforme a estrutura real do repositório.

### 1. Clonar o repositório

```bash
git clone https://github.com/<usuario>/<repositorio>.git
cd <repositorio>
```

### 2. Servidor (API)

```bash
# Criar e ativar o ambiente virtual (Python 3.12)
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# Instalar as dependências
pip install -r requirements.txt

# Baixar o modelo de visão e linguagem
ollama pull qwen2.5vl:3b

# Iniciar o servidor (acessível pela rede local)
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 3. Aplicativo (Android)

```bash
cd app
npm install

# Gerar o Dev Client (EAS Build) e instalar no aparelho
eas build --profile development --platform android

# Iniciar o bundler
npx expo start --dev-client
```

Em seguida, configure no app o **endereço IP do computador** que executa o servidor (ex.: `http://192.168.0.10:8000`).

---

## ✅ Testes

O projeto conta com **14 arquivos de testes automatizados** (`pytest`) e com **vídeos gravados** (pasta `gravacoes`) que são reproduzidos na API, permitindo testes repetíveis do fluxo completo.

```bash
pytest
```

---

## 👥 Equipe

**Grupo: SEXTETO SINISTRO**

- Caio Henrique Arruda Moreira
- José Guilherme Silva Freires
- Luiz Carlos Alves Freire
- Rafael Camilo Pradal
- Rafael Mota Silva
- Rian Almeida da Silva

**Instituição:** Fatec Zona Sul — Disciplina de Inteligência Artificial (2º sem. 2026)
**Professor:** Edson Ceroni
