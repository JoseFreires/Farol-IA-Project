# Farol: rodar no Android com Vosk (EAS Build, sem Android Studio)

## Por que isso é necessário

- O **Expo Go** não inclui módulos nativos customizados, como o `react-native-vosk`.
- Por isso o erro `TurboModuleRegistry... 'Vosk' could not be found` acontece no Expo Go.
- A solução é gerar um **development build** do Farol, que já vem com o Vosk e o modelo de voz.
- Com o **EAS Build**, a compilação acontece na nuvem da Expo. Não precisa de Android Studio, SDK, adb nem cabo USB.

## Pré-requisitos

- Conta gratuita em [expo.dev](https://expo.dev)
- Node.js instalado
- Celular Android com acesso à internet
- PC e celular na mesma rede Wi-Fi (para o Metro)

## Passo a passo

### 1. Instalar o dev client no projeto

Dentro da pasta `mobile`:

```bash
npx expo install expo-dev-client
```

### 2. Instalar o EAS CLI e fazer login pelo terminal

```bash
npm install -g eas-cli
eas login
```

> Faça o login pelo terminal. O login pelo navegador falha no Windows porque o `&` da URL quebra o comando `cmd /c start`.

### 3. Configurar o build

```bash
eas build:configure
```

Abra o `eas.json` e deixe o perfil `development` assim, para gerar um APK instalável:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": { "buildType": "apk" }
    }
  }
}
```

### 4. Gerar o build

```bash
eas build --profile development --platform android
```

- Leva cerca de 10 a 20 minutos.
- No plano gratuito pode haver fila.
- No final aparecem um link e um QR code.

### 5. Instalar o APK no celular

1. Abra o link (ou escaneie o QR code) no navegador do celular.
2. Baixe o APK.
3. Permita a instalação de fontes desconhecidas quando o Android pedir.
4. Instale o app **Farol**.

### 6. Rodar o projeto

No PC, dentro de `mobile`:

```bash
npx expo start --dev-client
```

- Abra o app **Farol** instalado (não o Expo Go).
- Conecte ao Metro pelo QR code ou pela lista de servidores.
- Se o PC e o celular não estiverem na mesma rede, use:

```bash
npx expo start --dev-client --tunnel
```

## Quando gerar um novo build

| Mudança | Precisa de novo build? |
|---|---|
| Código JS/TS (telas, lógica, serviços) | Não, o Metro recarrega |
| `app.json`, plugins, permissões | Sim |
| Nova dependência com código nativo | Sim |
| Troca do modelo Vosk (`assets/model-pt-fb-v0.1.1-20220516_2113`) | Sim |

## Problemas comuns

| Problema | O que fazer |
|---|---|
| Login do Expo abre erro no Windows | Use `eas login` no terminal, ou "Proceed anonymously" no `expo start` |
| App não conecta ao Metro | Confira a rede Wi-Fi ou use `--tunnel` |
| Upload do build reclama do tamanho | O modelo Vosk é grande; verifique o tamanho da pasta `assets` e o limite do plano |
| `Vosk could not be found` continua | Você está no Expo Go ou em um build antigo; abra o app Farol do novo build |

## Alternativa: build local (sem EAS)

Se preferir compilar na própria máquina, instale só as ferramentas de linha de comando:

1. Instale o **JDK 17**.
2. Baixe as **Command line tools** em developer.android.com/studio (seção "Command line tools only") e extraia em `C:\Android\cmdline-tools\latest`.
3. Instale os pacotes:
   ```bash
   sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
   ```
4. Defina `ANDROID_HOME=C:\Android` e adicione `%ANDROID_HOME%\platform-tools` ao `Path`.
5. No celular, ative **Opções do desenvolvedor → Depuração USB**, conecte o cabo e confirme com `adb devices`.
6. Rode `npx expo run:android`.
