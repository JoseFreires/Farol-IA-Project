# Farol

Aplicativo móvel de acessibilidade que usa a câmera e um modelo de visão para descrever imagens em voz alta. O app Expo envia a foto para uma API FastAPI no computador; a API consulta o modelo local no Ollama e devolve uma resposta em JSON.

```text
Celular (Expo) ── Wi-Fi ──> API FastAPI no computador ──> Ollama
```

O projeto está em desenvolvimento. A interface mostra as opções Ambiente, Ler texto, Produto e Documento, mas a API atual escolhe a análise automaticamente; boletos e cédulas ainda aparecem como “Em breve”.

## Pré-requisitos

- Python 3.12
- Node.js e npm
- [Ollama](https://ollama.com/)
- Um celular Android ou iPhone para testar. O celular e o computador precisam estar na mesma rede Wi-Fi.

## 1. Preparar o modelo de IA

Instale e abra o Ollama. No terminal, baixe o modelo usado por padrão pelo backend:

```powershell
ollama pull qwen2.5vl:7b
ollama list
```

Mantenha o Ollama em execução enquanto usar o aplicativo. Por padrão, o backend o acessa em `http://localhost:11434`.

## 2. Instalar e iniciar o backend

No PowerShell, na pasta raiz do repositório:

```powershell
cd backend
python --version
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Se a ativação do ambiente virtual for bloqueada pelo PowerShell, permita scripts apenas nessa janela e tente novamente:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

Crie `backend/.env` (na mesma pasta em que está `requirements.txt`) com um token escolhido por você:

```dotenv
APP_TOKEN=troque-por-um-token-de-desenvolvimento
OLLAMA_MODEL=qwen2.5vl:7b
```

`APP_TOKEN` é obrigatório. O modelo já tem esse valor padrão; a linha está incluída para deixar a configuração explícita. Opcionalmente, também é possível configurar `OLLAMA_HOST` e `OLLAMA_KEEP_ALIVE`.

Ainda dentro de `backend/`, inicie a API:

```powershell
python -m src.farol.main --host 0.0.0.0 --port 8000
```

Confirme no navegador do computador:

- `http://localhost:8000/health` deve retornar `{"ok":true}`.
- `http://localhost:8000/docs` abre a documentação da API.

O teste `/health` confirma que a API está no ar, mas não testa o Ollama. Se uma análise falhar, confirme também que `ollama list` mostra `qwen2.5vl:7b`.

## 3. Configurar e iniciar o aplicativo

Abra outro terminal na raiz do repositório e descubra o IP do computador na rede Wi-Fi:

```powershell
ipconfig
```

Use o endereço IPv4 do adaptador conectado à rede (por exemplo, `192.168.0.10`). Crie `mobile/.env`, ao lado de `package.json`:

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.0.10:8000
EXPO_PUBLIC_APP_TOKEN=troque-por-um-token-de-desenvolvimento
```

O token deve ser igual ao `APP_TOKEN` de `backend/.env`. Não use `localhost` no endereço do celular: nesse caso ele apontaria para o próprio celular. Em um emulador Android, use `http://10.0.2.2:8000`.

Instale as dependências do app e inicie o Expo:

```powershell
cd mobile
npm ci
npx expo start -c
```

Abra o projeto no Expo Go compatível com o SDK 57 e escaneie o QR code. No iPhone físico, entre com a mesma conta Expo no Expo Go e no computador. Se o Expo Go indicar incompatibilidade, atualize-o ou use um development build compatível.

No app, também é possível abrir **Configurações**, informar o endereço do servidor e tocar em **Salvar e testar conexão**. Essa opção substitui o endereço padrão informado em `mobile/.env`.

> `EXPO_PUBLIC_APP_TOKEN` é incorporado ao app e não é segredo seguro. Use apenas um token de desenvolvimento; não exponha a API publicamente.

## Uso diário

1. Deixe o Ollama em execução no computador.
2. Em um terminal, ative o ambiente e inicie o backend:
   ```powershell
   cd backend
   .\.venv\Scripts\Activate.ps1
   python -m src.farol.main --host 0.0.0.0 --port 8000
   ```
3. Em outro terminal, inicie o app:
   ```powershell
   cd mobile
   npx expo start
   ```
4. Abra o app no celular e permita o acesso à câmera.

## Solução de problemas

| Sintoma | O que conferir |
|---|---|
| Erro de configuração ao iniciar a API | `backend/.env` existe e contém `APP_TOKEN`; o comando foi executado a partir de `backend/`. |
| `No module named ...` ou `uvicorn` não encontrado | O ambiente virtual está ativado e `python -m pip install -r requirements.txt` terminou sem erros. |
| A API abre no computador, mas não no celular | Celular e computador estão na mesma rede; o endereço usa o IPv4 do computador; o Firewall do Windows permite conexões TCP na porta 8000 para a rede privada. |
| Erro 401 no app | `EXPO_PUBLIC_APP_TOKEN` e `APP_TOKEN` são iguais. Reinicie o Expo após mudar o `.env`. |
| Erro ao analisar a imagem | Ollama está em execução e o modelo configurado já foi baixado. |
| O app não encontra o servidor depois de mudar o `.env` | Pare e reinicie o Expo com `npx expo start -c`. |
| Expo Go informa incompatibilidade | O projeto usa Expo SDK 57; atualize o Expo Go ou use um development build compatível. |

O reconhecimento de perguntas por voz depende de um módulo nativo e não está disponível no Expo Go. O menu de boletos e cédulas ainda é apenas uma indicação de funcionalidade futura.

## Estrutura atual

```text
backend/
  app/                 # API FastAPI e processamento
  agent_runtime/       # execução das análises com Ollama
  core/ rules/         # comparação visual e regras
  skills/              # instruções das análises
  tests/               # testes do backend
  requirements.txt
mobile/
  src/app/             # telas Expo Router
  src/services/        # API, fala e vibração
  package.json
  app.json
```

Veja [backend/ARQUITETURA_TECNICA.md](backend/ARQUITETURA_TECNICA.md) para detalhes técnicos. Para executar os testes do backend, use o ambiente virtual ativado e rode `pytest` dentro de `backend/`.
