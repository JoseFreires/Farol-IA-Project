# Decisões de implementação

## 2026-11-02

- Escolha: voltar a usar `qwen2.5vl:3b` nas skills de descrição e resposta e no campo opcional `llm.modelo_risco`.

## 2026-11-02

- Escolha: voltar a usar `gemma3:4b` nas skills de descrição e resposta e no campo opcional `llm.modelo_risco` para testar o modelo na aplicação.

## 2026-11-01

- Contexto: o `gemma3:4b` repetiu objetos e produziu avisos não sustentados pelo contexto.
- Escolha: usar `qwen2.5vl:3b` nas skills de descrição e resposta, além do campo opcional `llm.modelo_risco`.
- Nota: o modelo está instalado localmente no Ollama; a alteração troca apenas o modelo chamado, sem alterar a detecção YOLO ou a estrutura dos prompts.

## 2026-10-31

- Contexto: a estrutura inicial foi montada e os arquivos de referência foram limpos para que o carregador de skills funcione.
- Escolha: manter o carregador `skills.py` conforme o protótipo original, sem reescrever o parser, apenas normalizando o layout do projeto e os arquivos `SKILL.md` para `gemma3:4b`.
- Alternativa descartada: reescrever a lógica de parsing em outra estrutura com `yaml.safe_load` customizado; isso poderia quebrar o contrato de `name == pasta` e a validação de `## Sistema` e `## Usuario`.

## 2026-10-31

- Contexto: o arquivo de testes gerado inicialmente exigia que `skill["sistema"]` contivesse o texto literal do cabeçalho `## Sistema`; o carregador oficial remove esse cabeçalho em prol do contrato documental.
- Escolha: ajustar os testes da Fase 0 para validar os requisitos da doc e do carregador, não o formato textual do cabeçalho.
- Alternativa descartada: alterar o carregador para reintroduzir `## Sistema` no texto; isso geraria divergência com a arquitetura do projeto e a regra de `## Sistema` sem variáveis.
