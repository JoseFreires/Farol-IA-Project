# Descritor de Imagens para Pessoas com Deficiência Visual

Aplicativo que usa a câmera do celular e uma IA de visão para **descrever em voz alta** o ambiente, rótulos de produtos e documentos. A IA roda **localmente, via Ollama**, sem custo e sem enviar imagens para a nuvem.

> Nome provisório. Projeto em desenvolvimento (MVP).

## Como funciona

```
[Celular: câmera + voz]  ──Wi-Fi──►  [Backend FastAPI no PC]  ──►  [Ollama (modelo de visão)]
        ▲                                     │
        └────────── texto em streaming ◄──────┘
```

1. O app tira a foto, reduz o tamanho e envia ao backend.
2. O backend monta o prompt do modo escolhido e consulta o modelo no Ollama.
3. A resposta volta em *streaming* e o app a fala frase por frase.

**Modos:** ambiente, leitura de texto, produto e documento. Há também validação de boletos pelos dígitos verificadores.

## Estrutura do repositório

```
descritor/
├── backend/
│   ├── app/
│   │   ├── prompts/        # base.txt + um arquivo por modo
│   │   ├── main.py         # rotas da API
│   │   ├── config.py       # variáveis de ambiente
│   │   ├── schemas.py
│   │   ├── prompts.py
│   │   ├── vision.py       # comunicação com o Ollama
│   │   ├── boleto.py       # validação de boletos
│   │   └── ocr.py          # (opcional) OCR com Tesseract
│   ├── tests/
│   ├── .env                # você cria (não vai para o Git)
│   └── requirements.txt
├── mobile/
│   ├── src/
│   │   ├── app/            # telas (Expo Router)
│   │   └── services/       # api.ts e fala.ts
│   ├── .env                # você cria (não vai para o Git)
│   └── package.json
└── eval/                   # fotos de teste e script de avaliação
```

## Pré-requisitos

| Ferramenta | Versão | Para quê |
|---|---|---|
| [Python](https://www.python.org/downloads/) | 3.12 | Backend |
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

   Opções conforme a memória de vídeo da sua placa:

   | Memória de vídeo | Modelo para testar |
   |---|---|
   | Sem GPU ou até 6 GB | `gemma3:4b` |
   | 8 GB | `qwen2.5vl:7b` ou `gemma3:12b` |
   | 12 GB ou mais | `gemma3:12b` ou `llama3.2-vision` |

   Os nomes das variantes mudam com frequência. Confira em <https://ollama.com/search?c=vision>.

3. Teste o modelo direto no terminal, antes de integrar:

   ```bash
   ollama run gemma3:4b "Descreva esta imagem em português: C:\caminho\foto.jpg"
   ```

4. Veja se o modelo está usando a GPU:

   ```bash
   ollama ps
   ```

   A coluna `PROCESSOR` deve indicar GPU (por exemplo, `100% GPU`).

## 2. Backend (FastAPI)

### 2.1 Criar o ambiente virtual e instalar dependências

**Windows (PowerShell):**

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Se o PowerShell reclamar de scripts desabilitados, rode uma vez:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

**Linux / macOS:**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Se ainda não houver `requirements.txt`, instale as dependências manualmente:

```bash
python -m pip install fastapi "uvicorn[standard]" ollama pydantic-settings pillow pytest
python -m pip freeze > requirements.txt
```

### 2.2 Configurar o `.env`

Crie o arquivo `backend/.env`:

```
APP_TOKEN=troque-por-um-segredo-longo
OLLAMA_MODEL=gemma3:4b
```

Variáveis opcionais:

| Variável | Padrão | Descrição |
|---|---|---|
| `OLLAMA_HOST` | `http://localhost:11434` | Endereço do Ollama |
| `OLLAMA_KEEP_ALIVE` | `30m` | Tempo que o modelo fica na memória |
| `OLLAMA_NUM_CTX` | `4096` | Contexto do modelo (suba para `8192` se sobrar memória) |

> O arquivo se chama `.env`, e não `.env.txt`. No Windows, ative a exibição de extensões no Explorador para conferir.

### 2.3 Rodar o servidor

Com o ambiente virtual ativado, dentro de `backend/`:

```bash
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Ao iniciar, o terminal deve mostrar `Modelo carregado.`. Confirme no navegador:

- `http://localhost:8000/health` deve mostrar `{"ok":true}`
- `http://localhost:8000/docs` mostra a documentação da API

### 2.4 Testes

```bash
pytest
```

## 3. Rede: permitir que o celular acesse o PC

1. Descubra o IP do PC na rede Wi-Fi:

   ```powershell
   ipconfig
   ```

   Procure o **Endereço IPv4** do adaptador Wi-Fi (algo como `192.168.0.10`).

2. Libere a porta 8000 no Firewall do Windows (PowerShell **como administrador**):

   ```powershell
   New-NetFirewallRule -DisplayName "Descritor API" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
   ```

3. No navegador do **celular**, abra `http://SEU-IP:8000/health`. Se aparecer `{"ok":true}`, a rede está certa.

> Redes de convidado de roteadores costumam isolar os aparelhos. Se o teste falhar, confirme que ambos estão na rede principal.

O Ollama continua escutando apenas em `localhost`. Somente o backend conversa com ele, e o celular nunca o acessa diretamente.

## 4. App móvel (Expo)

### 4.1 Atenção à versão do SDK

O Expo Go das lojas só abre projetos do **SDK que ele suporta**. Na App Store (iPhone), a versão do Expo Go está limitada ao SDK 54, e projetos criados com SDK mais novo mostram o erro *"Project is incompatible with this version of Expo Go"*.

Se for usar o Expo Go, crie ou mantenha o projeto no **SDK 54**:

```bash
npx create-expo-app@latest mobile --template default@sdk-54
```

Confira o SDK do seu projeto em `mobile/package.json` (linha `"expo"`). Alternativa para Android: baixar o Expo Go compatível com o seu SDK em <https://expo.dev/go>.

### 4.2 Instalar dependências

```bash
cd mobile
npm install
npx expo install expo-camera expo-image-manipulator expo-speech expo-haptics
```

Use sempre `npx expo install` (e não `npm install`) para bibliotecas do Expo, pois ele escolhe a versão compatível com o seu SDK.

### 4.3 Configurar o `.env`

Crie `mobile/.env`, ao lado do `package.json`:

```
EXPO_PUBLIC_API_URL=http://192.168.0.10:8000
EXPO_PUBLIC_APP_TOKEN=troque-por-um-segredo-longo
```

- `EXPO_PUBLIC_API_URL`: use o **IP do PC** (passo 3), com `http://` e a porta, **sem barra no final**. Nunca use `localhost`, que no celular aponta para o próprio celular. No emulador Android, use `http://10.0.2.2:8000`.
- `EXPO_PUBLIC_APP_TOKEN`: deve ser **exatamente igual** ao `APP_TOKEN` do `backend/.env`. Se forem diferentes, o backend responde erro 401.
- O prefixo `EXPO_PUBLIC_` é obrigatório.
- Sem aspas e sem espaços ao redor do `=`.

### 4.4 Permissão da câmera

No `app.json`, dentro de `"plugins"`, confirme a mensagem de permissão em português:

```json
["expo-camera", { "cameraPermission": "O app usa a câmera para descrever o que você aponta." }]
```

### 4.5 Rodar

```bash
npx expo start -c
```

O `-c` limpa o cache e é necessário sempre que o `.env` mudar. Escaneie o QR code com o **Expo Go** (Android) ou com a câmera do iPhone.

> Teste no **celular físico**, não no navegador (`w`). A câmera, a vibração e a voz se comportam de forma diferente na web, e o endereço do backend pode ser bloqueado por regras de CORS.

## 5. Ordem para iniciar o projeto no dia a dia

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
5. Abra o app no celular, aponte a câmera e toque em **Descrever**.

## 6. Perguntas por voz (development build)

O reconhecimento de fala usa um módulo nativo (`@react-native-voice/voice`) que **não funciona no Expo Go**. Enquanto você usa o Expo Go, o botão "Perguntar" apenas avisa por voz que o recurso não está disponível. Para ativá-lo, crie um *development build*:

```bash
npm install -g eas-cli
eas login
npx expo install expo-dev-client
npm install @react-native-voice/voice
eas build:configure
eas build --profile development --platform android
```

Instale o APK gerado no celular e rode `npx expo start --dev-client`.

- **Android:** gratuito.
- **iPhone:** instalar em um aparelho físico exige uma conta paga do Apple Developer Program.

No `app.json`, adicione em `"plugins"`:

```json
["@react-native-voice/voice", {
  "microphonePermission": "O app usa o microfone para ouvir suas perguntas.",
  "speechRecognitionPermission": "O app usa reconhecimento de fala para entender suas perguntas."
}]
```

## 7. OCR opcional (Tesseract)

Para melhorar a leitura de textos pequenos (validade, ingredientes, boletos):

1. Instale o Tesseract e marque o idioma **Português** durante a instalação.
2. Instale a biblioteca no ambiente do backend:
   ```bash
   python -m pip install pytesseract
   ```
3. Ajuste o caminho do executável em `backend/app/ocr.py`, caso tenha instalado em outro local.

Sem o Tesseract, o backend continua funcionando apenas com o modelo de visão.

## 8. Avaliação da qualidade

Coloque fotos reais em `eval/fotos/` e descreva os casos em `eval/casos.json`:

```json
[
  { "arquivo": "fotos/leite.jpg", "modo": "produto", "deve_conter": ["leite", "2027"] }
]
```

Rode, de dentro de `backend/` e com o ambiente virtual ativado:

```bash
python ../eval/rodar.py
```

Execute antes e depois de qualquer mudança de prompt ou de modelo, para comparar a acurácia.

## 9. Solução de problemas

| Problema | Causa provável | O que fazer |
|---|---|---|
| `uvicorn` não é reconhecido | Ambiente virtual desativado ou dependências não instaladas | Ative o `.venv` e use `python -m uvicorn ...` |
| `source .venv/bin/activate` não funciona no Windows | A pasta se chama `Scripts` | Use `.venv\Scripts\Activate.ps1` |
| `Project is incompatible with this version of Expo Go` | SDK do projeto maior que o do Expo Go | Veja a seção 4.1 |
| App diz "Não consegui analisar agora" | Token diferente, IP errado ou backend desligado | Compare os dois `.env` e teste `/health` no celular |
| `/health` não abre no celular | Firewall ou redes diferentes | Libere a porta 8000 e confira o Wi-Fi |
| Erro de validação ao iniciar o backend | Falta o `backend/.env` ou ele está com outro nome | Crie o arquivo com `APP_TOKEN` |
| Primeira resposta muito lenta | Modelo ainda carregando ou rodando na CPU | Aguarde `Modelo carregado.` e confira `ollama ps` |
| Respostas em inglês ou com markdown | Modelo pequeno ignorando o prompt | Reforce "Responda em português" nos prompts e baixe a temperatura |
| "Não consegui ver a imagem" | Foto preta, de lado, ou modelo sem visão | Teste o modelo no terminal e confira a captura |
| `Rendered more hooks than during the previous render` | Hook depois de um `return` na tela | Mantenha todos os hooks no topo do componente |
| Variável `EXPO_PUBLIC_*` aparece como `undefined` | Faltou prefixo ou reiniciar com cache limpo | Use `npx expo start -c` |
| O app parou de conectar do nada | O IP do PC mudou | Rode `ipconfig` e atualize o `mobile/.env` |

## 10. Limitações conhecidas

- **Funciona só com o PC ligado.** O Ollama e o backend rodam no seu computador, então o app só responde enquanto ele estiver ligado e na mesma rede. Isso serve para desenvolvimento, demonstração e TCC, mas não para distribuição pública.
- **Modelos locais são mais fracos** que os de nuvem, principalmente em texto pequeno e cenas complexas. Eles inventam mais, por isso a validação de boletos e o OCR são importantes.
- **Um pedido por vez.** A GPU atende bem uma requisição de cada vez.
- **Segurança provisória.** O token fixo é só para desenvolvimento. Antes de distribuir, troque por autenticação por usuário e use HTTPS.
- **Medicamentos.** A IA lê apenas o que está escrito na embalagem e sempre recomenda confirmar com um farmacêutico. Nunca confie nela para doses.
- **Não grave imagens em disco.** O projeto foi pensado para processar e descartar as fotos. Remova qualquer código de depuração que salve imagens (como um `debug.jpg`).

## 11. Próximos passos

- Aviso por voz quando a foto estiver escura, borrada ou cortada
- OCR no próprio celular (ML Kit) e modo offline para leitura de texto
- Leitura de boleto pelo código de barras
- Tela de configurações (velocidade da fala, nível de detalhe)
- Autenticação por usuário, limites de uso e HTTPS
- Testes com usuários cegos ou com baixa visão (parte essencial do projeto)

## Acessibilidade

O app deve funcionar **sem olhar a tela**. A cada mudança, teste o fluxo completo com **TalkBack** (Android) ou **VoiceOver** (iOS) ligado, e valide com pessoas cegas ou com baixa visão assim que possível.