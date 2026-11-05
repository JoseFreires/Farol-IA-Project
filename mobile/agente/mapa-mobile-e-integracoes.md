# Farol mobile: estrutura, integração e execução

Este documento consolida a estrutura atual do app mobile Farol, como suas telas e serviços se conectam ao backend e os pontos importantes encontrados durante a configuração e os testes.

## Visão geral

O mobile é um app React Native com Expo Router e TypeScript, configurado com Expo SDK 58 e React Native 0.88. O backend é uma API FastAPI executada no computador. O celular e o computador precisam estar acessíveis um ao outro pela rede local.

```text
Expo Router
  └── Câmera
       ├── captura quadros ── WebSocket /ws/frames ──> FastAPI
       ├── recebe descrições e alertas <── GET /saida ── FastAPI
       └── envia perguntas ── POST /pergunta ────────> FastAPI

Configurações ── GET /health ─────────────────────────> FastAPI
```

O endereço `8081` é usado pelo Metro/Expo durante o desenvolvimento. Ele não é a porta da API. A configuração local do backend usa a porta `8000`.

## Organização do código mobile

```text
mobile/
  src/
    app/
      _layout.tsx                Layout e providers globais
      index.tsx                  Redireciona para a câmera
      camera.tsx                 Permissão, preview e ciclo da câmera
      configuracoes.tsx          Preferências e teste do servidor
    components/
      camera/                    UI da câmera, pergunta e permissão
      Botao.tsx                  Botão reutilizável e acessível
      ...                        Outros componentes de UI
    escuta/
      EscutaContext.tsx          Estado e ciclo de vida do assistente
    hooks/
      useChamadaPorVoz.ts        Ligação de eventos de voz à tela
      useEstilos.ts              Estilos ligados ao tema
    services/
      api.ts                     URL, autorização e POST /pergunta
      transmissao.ts             Captura e envio de imagens por WebSocket
      mensagens.ts               Polling de GET /saida e encaminhamento à fala
      escuta.ts                  Integração nativa com Vosk
      fala.ts                    Síntese de voz
      gerenciadorFala.ts         Fila de fala com prioridades
      dialogo.ts                 Coordenação entre fala e escuta
      vibracao.ts                Feedback háptico
    settings/                    Preferências e persistência local
    theme/                       Paleta e estilos acessíveis
  assets/
    images/                      Ícones e imagens
    model-pt-fb-v0.1.1-20220516_2113/
                                Modelo Vosk de português
  app.json                       Configuração Expo e plugins nativos
  eas.json                       Perfis de build
  package.json                  Dependências e comandos
```

### Fluxo da câmera

1. A rota `camera.tsx` consulta a permissão pelo hook `useCameraPermissions`.
2. Se a permissão foi negada e ainda pode ser solicitada, **Permitir câmera** chama o prompt do sistema. Se o sistema não permite nova solicitação, o botão abre as configurações do app.
3. Ao voltar das configurações, o app consulta novamente a permissão.
4. Com a permissão concedida, `CameraView` inicia o preview. Quando a câmera está pronta e a tela está em foco, `servicoTransmissao` conecta ao WebSocket e `servicoMensagens` começa a consultar as saídas.
5. Ao sair da tela ou colocar o app em segundo plano, a transmissão e a consulta de mensagens são interrompidas.

A cadência configurada para captura é uma **meta de 24 quadros por segundo**. A implementação usa `takePictureAsync`, aguarda cada captura terminar e não permite capturas concorrentes. Portanto, a taxa real depende do tempo de captura e do desempenho do aparelho; 24 FPS não é garantido pelo método atual.

### Voz e acessibilidade

- `react-native-vosk` reconhece fala offline e usa o modelo local configurado em `app.json`.
- A palavra de ativação é “Farol”; o app também permite iniciar uma pergunta por botão ou toque longo na tela da câmera.
- `expo-speech` fala respostas e descrições; `gerenciadorFala.ts` ordena mensagens por prioridade para que riscos e respostas possam prevalecer sobre informações de ambiente.
- `expo-haptics` fornece feedback tátil. As preferências de voz, vibração, tema e contraste são mantidas localmente com AsyncStorage.

## Contrato mobile ↔ backend

| Funcionalidade no app | Serviço mobile | Endpoint/backend | Comportamento |
|---|---|---|---|
| Testar conexão nas configurações | `api.ts` | `GET /health` | Retorna `{"ok": true}` quando a API está disponível. |
| Transmitir a câmera | `transmissao.ts` | `WS /ws/frames` | Envia cada imagem como bytes binários; o backend ingere o quadro para análise. |
| Apresentar e narrar descrições/alertas | `mensagens.ts` | `GET /saida` | Consulta periodicamente a fila; cada mensagem pode ser mostrada na interface e enviada à fila de fala. |
| Fazer uma pergunta sobre a cena | `api.ts` e `camera.tsx` | `POST /pergunta` | Envia `{ "texto": "..." }`; o backend responde com `{ "frameId": ..., "texto": "..." }`, que o app exibe e fala. |

O endpoint `POST /frame` também existe no backend para envio HTTP síncrono de uma imagem, mas a câmera contínua do mobile usa `/ws/frames`.

## Configuração local

Crie `mobile/.env` ao lado de `package.json`:

```dotenv
EXPO_PUBLIC_API_URL=http://IP_DO_COMPUTADOR:8000
EXPO_PUBLIC_APP_TOKEN=mesmo_valor_configurado_no_backend
```

Use o IPv4 do computador na rede Wi-Fi, por exemplo `192.168.15.3`, e não `localhost` nem a porta do Metro (`8081`). O endpoint é composto pelo app; não inclua `/health`, `/pergunta`, `/saida` ou `/ws/frames` na URL-base.

O app também permite configurar e testar a URL em **Configurações → Servidor**. Um endereço salvo ali tem precedência sobre `EXPO_PUBLIC_API_URL`. Reinicie o Metro depois de alterar variáveis `EXPO_PUBLIC_*`:

```powershell
cd C:\WorkSpace\Farol-IA-Project\mobile
npx expo start -c
```

No computador, inicie o backend a partir da pasta `backend`:

```powershell
cd C:\WorkSpace\Farol-IA-Project\backend
.\.venv\Scripts\python.exe -m src.farol.main --host 0.0.0.0 --port 8000
```

O host `0.0.0.0` permite conexões pela rede local. Se o celular não alcançar a API, verifique se `/health` abre no navegador do celular, se ambos estão na mesma rede e se o Firewall do Windows permite conexões de entrada na porta `8000`. Um timeout de WebSocket geralmente indica que o celular não conseguiu estabelecer a conexão TCP; confira endereço, processo da API, interface de escuta e firewall antes de investigar o processamento de imagens.

`EXPO_PUBLIC_APP_TOKEN` é incorporado ao app e não deve ser tratado como segredo seguro. O token precisa corresponder à configuração do backend quando a autorização estiver habilitada.

## Expo Go, Vosk e builds nativos

O Expo Go padrão não contém o módulo nativo customizado `react-native-vosk`. Nele, a câmera pode funcionar, mas o reconhecimento Vosk falha com uma mensagem semelhante a:

```text
TurboModuleRegistry.getEnforcing(...): 'Vosk' could not be found
```

Para usar o assistente offline, instale um **development build** do Farol e inicie o Metro em modo dev client:

```powershell
cd C:\WorkSpace\Farol-IA-Project\mobile
npx expo run:android
npx expo start --dev-client
```

Também é possível gerar o build Android no EAS:

```powershell
npx eas-cli@latest build --platform android --profile development
```

Alterações somente em TypeScript normalmente podem ser servidas pelo Metro. Alterações em `app.json`, permissões, config plugins, dependências nativas ou modelo Vosk exigem gerar e instalar outro build. Recarregar o bundle JavaScript não registra um módulo nativo que esteja ausente do binário.

### Permissões

- `expo-camera` está configurado como plugin, com texto de permissão de câmera para iOS; a permissão de câmera também consta na configuração Android.
- `RECORD_AUDIO` é necessário para o Vosk no Android. A biblioteca também solicita essa permissão ao iniciar o reconhecimento.
- Depois de alterar permissões ou plugins em `app.json`, gere novamente e reinstale o build nativo.
- Se a pessoa negar uma permissão e o sistema bloquear novas solicitações, o app precisa abrir as configurações do próprio aplicativo; ao retornar, consulta o estado atualizado.

### Modelo Vosk e tamanho do build

O modelo compacto oficial de português (`vosk-model-small-pt-0.3`) fica em `mobile/assets/model-pt-0.3/`. O arquivo ZIP tem cerca de 31 MB e os arquivos descompactados ocupam cerca de 51 MB. A licença Apache 2.0 e a origem do modelo estão registradas junto aos assets. Por ser um modelo pequeno, sua precisão de transcrição é inferior à de modelos grandes; valide o reconhecimento em aparelhos e sotaques representativos.

```json
"models": [
  "assets/model-pt-0.3"
]
```

O modelo precisa permanecer no arquivo de build porque o reconhecimento é offline. A configuração do plugin e o identificador passado a `loadModel` devem usar o mesmo nome (`model-pt-0.3`). Depois de alterar o modelo ou o plugin, gere e instale um novo build nativo.

## Verificações úteis

```powershell
# Configuração Expo resolvida, incluindo plugins e permissões
npx expo config --type introspect

# Checagem do código mobile
npx expo lint
npx tsc --noEmit

# A API deve responder localmente e pela rede
Invoke-WebRequest http://127.0.0.1:8000/health
Invoke-WebRequest http://IP_DO_COMPUTADOR:8000/health
```

No estado mapeado durante o desenvolvimento, os fluxos `GET /health`, `POST /pergunta`, `/ws/frames` e `GET /saida` estão ligados às funcionalidades correspondentes no mobile. A suíte do backend passou com 54 testes; lint e TypeScript do mobile passaram, com um aviso de lint preexistente relacionado ao `require()` em `services/escuta.ts`.
