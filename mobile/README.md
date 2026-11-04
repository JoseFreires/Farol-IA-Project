# Farol — Aplicativo Mobile (Front-end)

Aplicativo móvel em **React Native com Expo (SDK 58)** voltado à assistência visual para pessoas cegas ou com baixa visão. O app transmite a imagem da câmera continuamente para a IA no backend, narra o ambiente e possíveis obstáculos através de síntese de voz (TTS) com fila de prioridades, e escuta comandos e perguntas por voz em tempo real através de um motor de fala offline (**Vosk**).

---

## 📱 Tecnologias e Recursos Nativos

* **Framework:** React Native `0.88.1` + Expo SDK `58`
* **Roteamento:** Expo Router (arquitetura baseada em arquivos em `src/app`)
* **Linguagem:** TypeScript
* **Visão Computacional:** Câmera contínua com captura de quadros via `expo-camera`
* **Reconhecimento de Voz (STT):** Motor offline `react-native-vosk` com modelo local em português brasileiro (`assets/model-small-pt-0.3`)
* **Síntese de Voz (TTS):** Narrador com controle de velocidade, tom e seleção de voz via `expo-speech`
* **Gerenciador de Fala:** Fila de mensagens orientada a prioridades (`1: Risco/Emergência`, `2: Resposta/Sistema`, `3: Descrição de Ambiente`)
* **Feedback Tátil:** Vibrações hápticas de confirmação e erro via `expo-haptics`
* **Persistência Local:** `@react-native-async-storage/async-storage` para preferências do usuário

> ⚠️ **ATENÇÃO — SOBRE O EXPO GO:**  
> Por utilizar bibliotecas nativas compiladas em C++/JNI para o processamento de voz offline (`react-native-vosk`), este aplicativo **NÃO roda no Expo Go padrão disponível nas lojas de aplicativos**.  
> Para executar o projeto, é **obrigatório** gerar uma **Development Build** ou rodar via compilação nativa com `npx expo run:android`.

---

## 📋 Pré-requisitos

1. **Node.js:** Versão 20.x ou superior (LTS recomendada).
2. **Gerenciador de Pacotes:** `npm` (incluso com o Node).
3. **Dispositivo Físico Android ou Emulador:**
   * Recomendamos testar em um **celular físico com Android**, pois o uso de câmera, microfone e alto-falante é central para a experiência.
4. **Para compilação nativa local (Opção A):**
   * [Android Studio](https://developer.android.com/studio) instalado e configurado.
   * Android SDK (API 34/35), Android NDK e Java JDK 17 instalados.
   * Variável `ANDROID_HOME` devidamente configurada nas variáveis de ambiente.
5. **Para compilação na nuvem (Opção B - Mais simples):**
   * Conta gratuita no [Expo.dev](https://expo.dev).
   * EAS CLI instalado globalmente: `npm install -g eas-cli`.

---

## ⚙️ Configuração do Ambiente (.env)

Dentro da pasta `mobile/`, crie um arquivo chamado `.env` (ao lado de `package.json`):

```env
# Endereço IP do computador onde o backend Farol está rodando (sem barra no final)
EXPO_PUBLIC_API_URL=http://192.168.0.10:8000

# Token de autorização (deve ser o mesmo configurado no backend/.env)
EXPO_PUBLIC_APP_TOKEN=seu-token-secreto-definido-no-backend
```

> **Dicas importantes:**
> * O celular e o computador onde roda o backend precisam estar na **mesma rede Wi-Fi**.
> * Descubra o IP da sua máquina executando `ipconfig` (Windows) ou `ifconfig` / `ip a` (Linux/macOS) e procure pelo endereço IPv4 (ex.: `192.168.1.50`).
> * No emulador Android oficial do Android Studio, você pode usar `http://10.0.2.2:8000`.
> * Você também pode alterar ou testar o endereço do servidor a qualquer momento diretamente na tela de **Configurações** do aplicativo.

---

## 🚀 Como Rodar a Aplicação

### 1. Instalar as dependências

Abra o terminal na pasta `mobile/`:

```bash
cd mobile
npm install
```

---

### 2. Executar no Android (Compilação Local)

Conecte seu celular Android ao computador via cabo USB (com a opção **Depuração USB** ativada nas Opções do Desenvolvedor) ou inicie um emulador Android:

```bash
npx expo run:android
```

Esse comando irá:
1. Executar o pré-build gerando o projeto nativo em `mobile/android/`.
2. Vincular as bibliotecas nativas (Vosk, Câmera, Áudio).
3. Compilar e instalar o APK de desenvolvimento diretamente no seu aparelho.
4. Iniciar o Metro Bundler para carregar o código JavaScript em tempo real.

Nas próximas vezes, para apenas subir o servidor de desenvolvimento após o app já estar instalado no celular:
```bash
npx expo start
```

---

### 3. Executar via Expo Dev Client (Build na Nuvem)

Se você não tiver o Android Studio instalado na máquina, utilize o serviço em nuvem do Expo:

1. Faça login na sua conta Expo:
   ```bash
   eas login
   ```
2. Gere o build de desenvolvimento na nuvem:
   ```bash
   eas build --platform android --profile development
   ```
3. Ao finalizar, o terminal fornecerá um link ou QR Code para baixar e instalar o APK no celular.
4. Com o app instalado no celular, inicie o servidor no computador:
   ```bash
   npx expo start --dev-client
   ```
5. Abra o aplicativo instalado e aponte para o QR Code gerado no terminal.

---

## 📦 Como Fazer o Build (Gerar APKs)

O projeto está configurado com perfis de build através do arquivo `eas.json`.

### 1. Gerar APK Autônomo para Testes (Perfil `preview`)
Gera um arquivo `.apk` pronto para instalar e usar em qualquer aparelho Android, sem necessidade de estar conectado ao Metro Bundler ou ao terminal:

```bash
eas build --platform android --profile preview
```
* O build ocorrerá nos servidores do Expo. Ao término, você receberá a URL para download direto do APK.

---

### 2. Gerar APK Localmente (Sem usar fila do EAS)
Se você possui o Android Studio configurado e deseja compilar o APK de release diretamente no seu computador:

```bash
npx expo run:android --variant release
```
O APK final será gerado dentro de:
`mobile/android/app/build/outputs/apk/release/app-release.apk`

---

### 3. Gerar Pacote para a Google Play Store (Perfil `production`)
Para gerar o pacote no formato Android App Bundle (`.aab`):

```bash
eas build --platform android --profile production
```

---

## 📂 Estrutura de Diretórios do Front-end

```
mobile/
├── assets/
│   ├── images/                     # Ícones e imagens da interface
│   └── model-small-pt-0.3/         # Modelo acústico Vosk para reconhecimento offline em pt-BR
├── src/
│   ├── app/                        # Telas e rotas (Expo Router)
│   │   ├── _layout.tsx             # Layout global com providers
│   │   ├── index.tsx               # Tela de apresentação / entrada
│   │   ├── camera.tsx              # Câmera contínua, detecção e escuta ativa
│   │   └── configuracoes.tsx       # Ajustes de voz, velocidade, tema e servidor
│   ├── components/                 # Componentes visuais e de acessibilidade
│   │   └── camera/                 # Barra superior, visor, painel inferior e modal de pergunta
│   ├── escuta/                     # Contexto de escuta (EscutaContext.tsx)
│   ├── hooks/                      # Hooks customizados (chamada de voz, estilos)
│   ├── services/                   # Camada de serviços e integração
│   │   ├── api.ts                  # Requisições HTTP com o backend
│   │   ├── dialogo.ts              # Orquestrador assíncrono entre voz e microfone
│   │   ├── escuta.ts               # Motor de escuta contínua e wake-word (Vosk)
│   │   ├── fala.ts                 # Wrapper do expo-speech
│   │   ├── gerenciadorFala.ts      # Fila de fala priorizada do assistente
│   │   ├── mensagens.ts            # Consumo de mensagens e avisos do backend
│   │   ├── transmissao.ts          # Transmissão periódica de frames da câmera
│   │   └── vibracao.ts             # Padrões táteis de resposta
│   ├── settings/                   # Gerenciamento de configurações e AsyncStorage
│   └── theme/                      # Paleta de cores, espaçamentos e estilos acessíveis
├── app.json                        # Configuração do Expo e plugins nativos
├── eas.json                        # Perfis de compilação EAS Build
├── package.json                    # Dependências e scripts
└── tsconfig.json                   # Configuração do TypeScript
```

---

## ♿ Recursos de Acessibilidade

O aplicativo foi projetado para uso autônomo por pessoas cegas ou com baixa visão:
* **Acionamento por Voz ("Farol"):** Diga a palavra *"Farol"* a qualquer momento na tela da câmera para fazer uma pergunta sobre o que está à sua frente.
* **Toque Longo:** Segurar qualquer ponto da tela da câmera por 600ms aciona imediatamente o assistente de voz ("Pode perguntar").
* **Compatibilidade com Leitores de Tela:** Todos os botões, interruptores e áreas táteis possuem rótulos descritivos acessíveis para TalkBack (Android) e VoiceOver (iOS).
* **Fila de Fala Inteligente:** Alertas de riscos imediatos (degraus, buracos, obstáculos próximos) interrompem descrições informativas em andamento.

---

## 🛠️ Solução de Problemas Comuns

| Sintoma | Causa Mais Provável | Solução |
| :--- | :--- | :--- |
| **"Vosk: não foi possível carregar o módulo"** | O app foi aberto no Expo Go padrão em vez de uma Development Build. | Execute `npx expo run:android` ou gere a build com `eas build`. |
| **"Não consegui conectar ao servidor"** | IP do computador alterado ou bloqueio de firewall. | Verifique se o IP no `.env` bate com `ipconfig`, confira se a porta 8000 está liberada e teste em **Configurações > Servidor**. |
| **O aplicativo não ouve perguntas** | Permissão de microfone negada no sistema. | Acesse as Configurações do Android > Aplicativos > Farol > Permissões e autorize o Microfone. |
| **Mudanças no `.env` não surtiram efeito** | Cache do Metro Bundler ativo. | Inicie o bundler limpando o cache com `npx expo start -c`. |
| **Erro de compilação no TypeScript** | Tipos desatualizados ou dependência pendente. | Execute `npx tsc --noEmit` para diagnosticar tipagens. |
