
```yaml
yolo:
  modelo: yolo26n.pt # Modelo do YOLO
  conf_deteccao: 0.25        # JSON bruto (permissivo)

filtro:
  conf_min: 0.50 # Confiança minima para entrar na descrição
  area_min: 0.01 # Area minima para entrar na descrição
  max_objetos: 8 # Máximo de objetos que podem ser descritos em uma unica fala

mudanca:
  frames_para_entrar: 3 # Quantos quadros um objeto precisa aparecer consecutivamente para ser considerado 
  frames_para_sair: 5 # Quantos frames consecutivos é necessário que o objeto não apareça mais para ser considerado ausente
  limiar_score: 0.6 # Valor que ao final dos calculos de mudanças de objetos considerando seus respectivos pesos deve atingir para ser comunicado
  cooldown_informativo_s: 4 # Tempo em segundos de pausa entre uma fala informativa e outra 
  fracao_drastica: 0.70 # Valor em % de mudança para que seja considerado drastico "ativar descrição ambiente" 
  pesos_classe: { person: 1.0, car: 1.0, dog: 0.9, chair: 0.4 }
  pesos_distancia: { "muito perto": 1.0, "perto": 0.8, "a média distância": 0.5, "longe": 0.2 } # chave: valor de objetos e seus pesos de relevancia

risco:
  conf_min: 0.30 # confiança minima necessária para um objeto de risco
  fator_aproximacao: 1.3 # Valor para identificar a "aproximação" do objeto em relação ao ultimo frame, caso seja alcançado o Agente alerta
  repetir_apos_s: 10 # tempo em segundos para o aviso de risco ser repetido caso continue no campo de captação
  classes: [knife, scissors, car, truck, bus, motorcycle, bicycle] #objetos mapeados como risco

mensagens:
  expira_ms_informativa: 4000 # tempo em mili segundos para a informação classificada como "INFORMATIVA" expirar e não ser mais comunicada, evitando que o usuário receba uma informação com delay
  expira_ms_resposta: 8000  # tempo em mili segundos para a informação classificada como "REPOSTA_PERGUNTA" expirar e não ser mais comunicada, evitando que o usuário receba uma informação com delay

llm:
  pasta_skills: skills              # onde ficam os SKILL.md
  modelo_risco: gemma3b:4b        # uso opcional; fora das skills em Markdown
  # modelo, temperatura e tokens de cada skill ficam no frontmatter do SKILL.md
```