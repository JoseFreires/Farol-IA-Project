# Farol

Aplicativo que usa a câmera do celular e uma IA de visão para **descrever em voz alta** o ambiente, textos, produtos e documentos, pensado para pessoas cegas ou com baixa visão. A IA roda **localmente, via Ollama**: sem custo e sem enviar imagens para a nuvem.

> Projeto em desenvolvimento (MVP).

## Funcionalidades

| Função | O que faz |
|---|---|
| **Ambiente** | Descreve o lugar, os objetos e onde cada um está |
| **Ler texto** | Lê placas, cardápios, cartas e outros textos |
| **Produto** | Identifica embalagem, marca, validade e ingredientes |
| **Documento** | Lê contas e papéis, destacando valores e datas |
| **Perguntar** | Perguntas por voz sobre a última foto (exige *development build*) |
| **Configurações** | Voz, nível de detalhe, qualidade da foto, vibração e servidor |
| **Validação de boleto** | Rota do backend que confere os dígitos verificadores |

Em planejamento: leitura de boleto pelo código de barras, cédulas de real, OCR no aparelho e histórico.

## Como funciona

```
[Celular: câmera + voz]  ──Wi-Fi──►  [Backend FastAPI no PC]  ──►  [Ollama (modelo de visão)]
        ▲                                     │
        └────────── texto em streaming ◄──────┘
```

1. O app tira a foto, reduz o tamanho e envia ao backend junto com o modo e o nível de detalhe escolhidos.
2. O backend monta o prompt (base + modo + detalhe) e consulta o modelo no Ollama.
3. A resposta volta em *streaming* e o app a fala frase por frase, com a voz configurada.

## Navegação do app

```
Acesso (index) ──► Menu ──► Câmera (descrever), com o modo escolhido
                      └───► Configurações
```

| Tela | Arquivo | Observação |
|---|---|---|
| Acesso | `src/app/index.tsx` | Ainda sem autenticação: o botão Entrar só abre o menu |
| Menu | `src/app/menu.tsx` | Uma linha por função, atalho para Configurações e seção "Em breve" |
| Câmera | `src/app/descrever.tsx` | Recebe o modo pela rota (`/descrever?modo=produto`) |
| Configurações | `src/app/configuracoes.tsx` | Alterações valem na hora e ficam salvas no aparelho |

**Identidade visual:** azul-marinho como base (`#0B1F3A`, `#12305C`) e amarelo-farol como destaque (`#FFC93C`). Cores, espaçamentos e tamanhos de fonte ficam em `src/theme/tema.ts`.

## Estrutura do repositório

```
farol/
├── backend/
│   ├── app/
│   │   ├── prompts/
│   │   │   ├── base.txt, ambiente.txt, texto.txt, produto.txt, documento.txt
│   │   │   └── detalhe_resumo.txt, detalhe_completo.txt
│   │   ├── main.py         # rotas da API e carga do modelo ao iniciar
│   │   ├── config.py       # variáveis de ambiente
│   │   ├── schemas.py      # formato dos pedidos (inclui o campo "detalhe")
│   │   ├── prompts.py      # monta o prompt: base + modo + detalhe
│   │   ├── vision.py       # comunicação com o Ollama
│   │   ├── boleto.py       # validação de boletos
│   │   └── ocr.py          # (opcional) OCR com Tesseract
│   ├── tests/
│   ├── .env                # você cria (não vai para o Git)
│   └── requirements.txt
├── mobile/
│   ├── src/
│   │   ├── app/            # telas (Expo Router)
│   │   ├── components/     # Logo, Botao, CartaoMenu, LinhaOpcoes, LinhaSwitch
│   │   ├── data/           # funcoes.ts: lista de funções do menu
│   │   ├── services/       # api.ts, fala.ts, vibracao.ts
│   │   ├── settings/       # tipos.ts, atual.ts, ConfiguracoesContext.tsx
│   │   └── theme/          # tema.ts
│   ├── .env                # você cria (não vai para o Git)
│   ├── app.json
│   ├── tsconfig.json
│   └── package.json
└── eval/                   # fotos de teste e script de avaliação
```

## Pré-requisitos

| Ferramenta | Versão | Para quê |
|---|---|---|
| [Python](https://www.python.org/downloads/) | 3.12 (evite versões muito novas, como a 3.14) | Backend |
| [Node.js](https://nodejs.org/) | 20 ou superior | App móvel |
| [Ollama](https://ollama.com/) | Mais recente | Rodar a IA local |
| [Git](https://git-scm.com/) | Qualquer | Controle de versão |
| Celular físico | Android ou iPhone | Testar o app |
| [Tesseract OCR](https://github.com/UB-Mannheim/tesseract/wiki) | Opcional | Melhorar a leitura de texto |

**Hardware:** uma placa de vídeo dedicada (GPU) é fortemente recomendada. Sem GPU, o modelo roda na CPU e cada resposta pode levar dezenas de segundos.

O computador e o celular precisam estar na **mesma rede Wi-Fi**.

## 1. Preparar a IA (Ollama)

1. Instale o Ollama pelo site oficial. Ele passa a rodar em segundo plano em `http://localhost:11434`.
2. Baixe um modelo de visão. Para começar:

   ```bash
   ollama pull gemma3:4b
   ```

   | Memória de vídeo | Modelo para testar |
   |---|---|
   | Sem GPU ou até 6 GB | `gemma3:4b` |
   | 8 GB | `qwen2.5vl:7b` ou `gemma3:12b` |
   | 12 GB ou mais | `gemma3:12b` ou `llama3.2-vision` |

   Os nomes das variantes mudam com frequência. Confira em <https://ollama.com/search?c=vision>.

3. Teste o modelo no terminal, antes de integrar:

   ```bash
   ollama run gemma3:4b "Descreva esta imagem em português: C:\caminho\foto.jpg"
   ```

4. Veja se ele usa a GPU (a coluna `PROCESSOR` deve indicar GPU):

   ```bash
   ollama ps
   ```

## 2. Backend (FastAPI)

### 2.1 Ambiente virtual e dependências

**Windows (PowerShell):**

```powershell
cd backend
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Se o PowerShell reclamar de scripts desabilitados, rode uma vez `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. Se o comando `py -3.12` não existir, use `python -m venv .venv`.

**Linux / macOS:**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Sem `requirements.txt`, instale manualmente:

```bash
python -m pip install fastapi "uvicorn[standard]" ollama pydantic-settings pillow pytest
python -m pip freeze > requirements.txt
```

Quando o ambiente está ativo, o prompt mostra `(.venv)`. Confira com `where.exe python` (Windows) ou `which python`: o caminho deve apontar para dentro de `backend/.venv`.

### 2.2 Configurar o `.env`

Crie `backend/.env`:

```
APP_TOKEN=troque-por-um-segredo-longo
OLLAMA_MODEL=gemma3:4b
OLLAMA_KEEP_ALIVE=30m
OLLAMA_NUM_CTX=4096
```

| Variável | Padrão | Descrição |
|---|---|---|
| `APP_TOKEN` | (obrigatória) | Token que o app envia; deve ser igual ao do `mobile/.env` |
| `OLLAMA_MODEL` | `gemma3:4b` | Modelo de visão usado |
| `OLLAMA_HOST` | `http://localhost:11434` | Endereço do Ollama |
| `OLLAMA_KEEP_ALIVE` | `30m` | Tempo que o modelo fica na memória |
| `OLLAMA_NUM_CTX` | `4096` | Contexto do modelo (suba para `8192` se sobrar memória de vídeo) |

O `config.py` deve declarar todos esses campos e usar `extra="ignore"`:

```python
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_token: str
    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "gemma3:4b"
    ollama_keep_alive: str = "30m"
    ollama_num_ctx: int = 4096
```

> O arquivo se chama `.env`, e não `.env.txt`. No Windows, ative a exibição de extensões para conferir.

### 2.3 Nível de detalhe no backend

O app envia o campo `detalhe` (`resumo`, `normal` ou `completo`). Três pontos tratam dele:

- **`schemas.py`:** `detalhe: Literal["resumo", "normal", "completo"] = "normal"` em `DescreverRequest`.
- **`prompts.py`:** `montar_system(modo, detalhe)` junta `base.txt`, o arquivo do modo e, se existir, `detalhe_<nivel>.txt`. O nível `normal` não tem arquivo.
- **`vision.py`:** limita o tamanho da resposta por nível.

  ```python
  TOKENS = {"resumo": 160, "normal": 500, "completo": 900}
  ```

  Em `descrever_stream`, use `options={**OPCOES, "num_predict": TOKENS[req.detalhe]}`. Já em `aquecer()`, que não recebe `req`, use `options={**OPCOES, "num_predict": 1}`.

### 2.4 Rodar o servidor

Com o ambiente virtual ativado, dentro de `backend/`:

```bash
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

O terminal deve mostrar `Modelo carregado.`. Confirme no navegador:

- `http://localhost:8000/health` deve mostrar `{"ok":true}`
- `http://localhost:8000/docs` mostra a documentação da API

### 2.5 Testes

```bash
pytest
```

## 3. Rede: permitir que o celular acesse o PC

1. Descubra o IP do PC na rede Wi-Fi com `ipconfig` (campo **Endereço IPv4**, algo como `192.168.0.10`).
2. Libere a porta 8000 no Firewall do Windows (PowerShell **como administrador**):

   ```powershell
   New-NetFirewallRule -DisplayName "Farol API" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
   ```

3. No navegador do **celular**, abra `http://SEU-IP:8000/health`. Se aparecer `{"ok":true}`, a rede está certa.

> Redes de convidado costumam isolar os aparelhos. O IP do PC também pode mudar com o tempo: quando isso acontecer, corrija o endereço em **Configurações > Servidor**, sem precisar editar o `.env` nem reiniciar o Expo.

## 4. App móvel (Expo)

### 4.1 Atenção à versão do SDK

O Expo Go das lojas só abre projetos do **SDK que ele suporta**. Na App Store, ele está limitado ao SDK 54, e projetos criados com SDK mais novo mostram o erro *"Project is incompatible with this version of Expo Go"*. Para usar o Expo Go, crie o projeto no SDK 54:

```bash
npx create-expo-app@latest mobile --template default@sdk-54
```

Confira o SDK em `mobile/package.json` (linha `"expo"`). No Android, outra opção é instalar o Expo Go compatível com o seu SDK em <https://expo.dev/go>.

### 4.2 Instalar dependências

```bash
cd mobile
npm install
npx expo install expo-camera expo-image-manipulator expo-speech expo-haptics
npx expo install react-native-svg @react-native-async-storage/async-storage
```

| Biblioteca | Para quê |
|---|---|
| `expo-camera`, `expo-image-manipulator` | Capturar e reduzir a foto |
| `expo-speech`, `expo-haptics` | Voz e vibração |
| `react-native-svg` | Logo do farol |
| `@react-native-async-storage/async-storage` | Guardar as configurações no aparelho |
| `@expo/vector-icons`, `expo-constants` | Ícones e versão do app (normalmente já vêm com o Expo) |

Use sempre `npx expo install` (e não `npm install`) para bibliotecas do Expo, pois ele escolhe a versão compatível com o seu SDK. Se faltar `@expo/vector-icons` ou `expo-constants`, instale do mesmo jeito.

### 4.3 Configurar o `.env`

Crie `mobile/.env`, **ao lado do `package.json`** (e não dentro de `src/`):

```
EXPO_PUBLIC_API_URL=http://192.168.0.10:8000
EXPO_PUBLIC_APP_TOKEN=troque-por-um-segredo-longo
```

- `EXPO_PUBLIC_API_URL`: o **IP do PC** (passo 3), com `http://` e a porta, **sem barra no final**. Nunca use `localhost`, que no celular aponta para o próprio celular. No emulador Android, use `http://10.0.2.2:8000`.
- `EXPO_PUBLIC_APP_TOKEN`: deve ser **exatamente igual** ao `APP_TOKEN` do backend.
- O prefixo `EXPO_PUBLIC_` é obrigatório. Sem aspas e sem espaços ao redor do `=`.
- Esse endereço é só o **padrão**: o endereço salvo em Configurações tem prioridade sobre ele.

### 4.4 `app.json` e `tsconfig.json`

No `app.json`, dentro de `"expo"`:

```json
"name": "Farol",
"slug": "farol",
"userInterfaceStyle": "dark",
"plugins": [
  ["expo-camera", { "cameraPermission": "O Farol usa a câmera para descrever o que você aponta." }]
]
```

No `tsconfig.json`, os caminhos do alias `@/` precisam começar com `./`:

```json
"paths": {
  "@/*": ["./src/*"],
  "@/assets/*": ["./assets/*"]
}
```

### 4.5 Rodar

```bash
npx expo start -c
```

O `-c` limpa o cache e é necessário sempre que o `.env` mudar. Escaneie o QR code com o **Expo Go** (Android) ou com a câmera do iPhone.

> Teste no **celular físico**, não no navegador (`w`). Câmera, vibração e voz se comportam de forma diferente na web, e o endereço do backend pode ser bloqueado por regras de CORS.

## 5. Configurações

Todas valem **na hora**, sem botão "Salvar", e o app confirma por voz. Ficam salvas no aparelho (AsyncStorage, chave `farol:config:v1`).

| Configuração | Opções | Padrão | Efeito |
|---|---|---|---|
| Velocidade da fala | Lenta, Normal, Rápida, Muito rápida | Normal | Taxa da voz (0,75 / 1 / 1,3 / 1,7) |
| Tom da voz | Grave, Normal, Agudo | Normal | Tom da voz (0,8 / 1 / 1,2) |
| Voz | Padrão do sistema ou vozes pt-BR do aparelho | Padrão | Voz usada pelo app |
| Nível de detalhe | Resumo, Normal, Completo | Normal | Prompt e tamanho da resposta no backend |
| Qualidade da foto | Rápida, Equilibrada, Detalhada | Rápida | Largura da imagem enviada (1024 / 1280 / 1536 px) |
| Vibração | Ligada ou desligada | Ligada | Feedback tátil em todo o app |
| Endereço do servidor | Texto | Vazio (usa o `.env`) | URL da API, com botão **Salvar e testar conexão** |

Há também o botão **Restaurar configurações padrão** e a seção **Sobre**, com versão e aviso de que a IA pode errar.

### Como funciona por dentro

- `settings/tipos.ts`: tipos, valores padrão e a função `normalizar`, que corrige qualquer dado inválido ao carregar.
- `settings/atual.ts`: cópia síncrona da configuração em vigor, lida por serviços que não são componentes React.
- `settings/ConfiguracoesContext.tsx`: *Provider* que carrega, salva e distribui as preferências (`useConfig()` nas telas).
- `services/fala.ts`, `services/api.ts` e `services/vibracao.ts` leem `obterConfig()` a cada uso.

### Adicionar uma nova configuração

1. Inclua o campo em `Configuracoes` e em `PADRAO` (`settings/tipos.ts`) e valide-o em `normalizar`.
2. Aplique o valor no serviço ou na tela que ele afeta (via `obterConfig()` ou `useConfig()`).
3. Adicione o controle em `src/app/configuracoes.tsx`, usando `LinhaOpcoes` (escolha única) ou `LinhaSwitch` (liga/desliga).
4. Confirme a mudança por voz com `falar(...)` e teste com o leitor de tela ligado.

## 6. Ordem para iniciar o projeto no dia a dia

1. Abra o Ollama (ele deve estar em execução em segundo plano).
2. Inicie o backend:
   ```bash
   cd backend
   .venv\Scripts\Activate.ps1
   python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
3. Aguarde a mensagem `Modelo carregado.`.
4. Em outro terminal, inicie o app:
   ```bash
   cd mobile
   npx expo start -c
   ```
5. No celular, toque em **Entrar**, escolha uma função, aponte a câmera e toque em **Descrever**.
6. Se o app não conectar, abra **Configurações > Servidor** e use **Salvar e testar conexão**.

## 7. Perguntas por voz (development build)

O reconhecimento de fala usa um módulo nativo (`@react-native-voice/voice`) que **não funciona no Expo Go**. Enquanto você usa o Expo Go, o botão "Perguntar" apenas avisa por voz que o recurso não está disponível. Para ativá-lo, crie um *development build*:

```bash
npm install -g eas-cli
eas login
npx expo install expo-dev-client
npm install @react-native-voice/voice
eas build:configure
eas build --profile development --platform android
```

Instale o APK gerado e rode `npx expo start --dev-client`.

- **Android:** gratuito.
- **iPhone:** instalar em um aparelho físico exige uma conta paga do Apple Developer Program.

No `app.json`, adicione em `"plugins"`:

```json
["@react-native-voice/voice", {
  "microphonePermission": "O Farol usa o microfone para ouvir suas perguntas.",
  "speechRecognitionPermission": "O Farol usa reconhecimento de fala para entender suas perguntas."
}]
```

Em build Android com `http://` (sem HTTPS), instale `expo-build-properties` e habilite `"usesCleartextTraffic": true` apenas para desenvolvimento.

## 8. OCR opcional (Tesseract)

Para melhorar a leitura de textos pequenos (validade, ingredientes, boletos):

1. Instale o Tesseract e marque o idioma **Português** durante a instalação.
2. Instale a biblioteca no ambiente do backend: `python -m pip install pytesseract`.
3. Ajuste o caminho do executável em `backend/app/ocr.py`, caso tenha instalado em outro local.

Sem o Tesseract, o backend continua funcionando apenas com o modelo de visão.

## 9. Avaliação da qualidade

Coloque fotos reais em `eval/fotos/` e descreva os casos em `eval/casos.json`:

```json
[
  { "arquivo": "fotos/leite.jpg", "modo": "produto", "deve_conter": ["leite", "2027"] },
  { "arquivo": "fotos/sala.jpg", "modo": "ambiente", "deve_conter": ["sofá", "janela"] }
]
```

Rode, de dentro de `backend/` e com o ambiente virtual ativado:

```bash
python ../eval/rodar.py
```

Execute antes e depois de qualquer mudança de prompt ou de modelo, para comparar a acurácia.

## 10. Solução de problemas

### Backend

| Problema | Causa provável | O que fazer |
|---|---|---|
| `uvicorn` não é reconhecido | Ambiente virtual desativado ou dependências não instaladas | Ative o `.venv` e use `python -m uvicorn ...` |
| `source .venv/bin/activate` não funciona no Windows | A pasta se chama `Scripts` | Use `.venv\Scripts\Activate.ps1` |
| Caminhos de erro apontam para `AppData\Roaming\Python` | Está usando o Python global, não o `.venv` | Ative o ambiente virtual (de preferência com Python 3.12) |
| `Extra inputs are not permitted` ao iniciar | `.env` tem variáveis que o `config.py` não declara | Declare os campos e use `extra="ignore"` (seção 2.2) |
| Erro de validação por falta de `app_token` | Falta o `backend/.env` ou ele tem outro nome | Crie o arquivo com `APP_TOKEN` |
| `Aviso: não consegui carregar o modelo (name 'req' is not defined)` | `aquecer()` usa `req`, que não existe ali | Use `"num_predict": 1` em `aquecer()` (seção 2.3) |
| Primeira resposta muito lenta | Modelo ainda carregando ou rodando na CPU | Aguarde `Modelo carregado.` e confira `ollama ps` |
| Respostas em inglês ou com markdown | Modelo pequeno ignorando o prompt | Reforce "Responda em português" nos prompts e use temperatura baixa |
| "Não consigo ver a imagem" | Foto preta, de lado, ou modelo sem visão | Teste o modelo no terminal e confira a captura |

### App e rede

| Problema | Causa provável | O que fazer |
|---|---|---|
| `Project is incompatible with this version of Expo Go` | SDK do projeto maior que o do Expo Go | Veja a seção 4.1 |
| `MalformedURLException: no protocol: undefined/descrever` | O app não leu `EXPO_PUBLIC_API_URL` | Confira o `mobile/.env` (pasta, nome e prefixo) e rode `npx expo start -c`. Ou informe o endereço em Configurações |
| "Endereço do servidor não está configurado" (falado) | Nem o `.env` nem as configurações têm endereço | Informe o endereço em **Configurações > Servidor** |
| App diz "Não consegui analisar agora" | Token diferente, IP errado ou backend desligado | Compare os dois tokens e use **Salvar e testar conexão** |
| `/health` não abre no celular | Firewall ou redes diferentes | Libere a porta 8000 e confira o Wi-Fi |
| No iPhone, a rede local falha | Permissão de Rede Local negada ao Expo Go | *Ajustes > Expo Go > Rede Local* |
| O app parou de conectar do nada | O IP do PC mudou | Rode `ipconfig` e corrija em Configurações > Servidor |
| `Rendered more hooks than during the previous render` | Hook depois de um `return` na tela | Mantenha todos os hooks no topo do componente |
| `Non-relative paths are not allowed` no `tsconfig.json` | Faltou `./` nos caminhos de `paths` | Use `"./src/*"` |
| O app abre direto na câmera, sem o acesso e o menu | Restou um `index.tsx` antigo duplicado | Mantenha só `src/app/index.tsx` (acesso) e apague `app/index.tsx` da raiz |
| Erro de tipo na rota `"/descrever"` na primeira vez | Os tipos do Expo Router ainda não foram gerados | Reinicie com `npx expo start -c` |
| `Variável EXPO_PUBLIC_*` aparece como `undefined` | Faltou prefixo ou reiniciar com cache limpo | Use `npx expo start -c` |
| Configurações não são lembradas | AsyncStorage não instalado | `npx expo install @react-native-async-storage/async-storage` |

## 11. Limitações conhecidas

- **Funciona só com o PC ligado.** O Ollama e o backend rodam no seu computador, então o app só responde enquanto ele estiver ligado e na mesma rede. Serve para desenvolvimento, demonstração e TCC, mas não para distribuição pública.
- **Modelos locais são mais fracos** que os de nuvem, principalmente em texto pequeno e cenas complexas. Eles inventam mais, por isso a validação de boletos e o OCR são importantes.
- **Um pedido por vez.** A GPU atende bem uma requisição de cada vez.
- **Acesso sem autenticação.** A tela de acesso ainda não valida nada, e o token fixo é só para desenvolvimento. Antes de distribuir, use autenticação por usuário e HTTPS.
- **Medicamentos.** A IA lê apenas o que está escrito na embalagem e sempre recomenda confirmar com um farmacêutico. Nunca confie nela para doses.
- **Não grave imagens em disco.** O projeto foi pensado para processar e descartar as fotos. Remova qualquer código de depuração que salve imagens (como um `debug.jpg`).

## 12. Próximos passos

1. **Qualidade da captura:** aviso por voz para foto escura, borrada ou cortada, e gesto simples para fotografar.
2. **Leitura de texto:** OCR no celular (ML Kit), leitura de boleto pelo código de barras e modo offline.
3. **Configurações, Fase 2:** falar respostas automaticamente, abrir direto em um modo, tamanho do texto e alto contraste (exige tema dinâmico).
4. **Contas e banco de dados:** login por usuário, preferências na nuvem e histórico opcional, sem guardar imagens.
5. **Testes com usuários reais:** validar com pessoas cegas ou com baixa visão e medir a acurácia com um conjunto de fotos.
6. **Publicação segura:** autenticação, HTTPS, hospedagem fora do PC, política de privacidade (LGPD) e beta fechado.

## Acessibilidade

O app deve funcionar **sem olhar a tela**. A cada mudança, teste o fluxo completo com **TalkBack** (Android) ou **VoiceOver** (iOS) ligado, e valide com pessoas cegas ou com baixa visão assim que possível. Cada controle precisa ter rótulo, papel e estado falados corretamente.