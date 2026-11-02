from collections import Counter
from dataclasses import dataclass, field
from typing import Any


CLASSES_VIVAS = {
    "person",
    "bird",
    "cat",
    "dog",
    "horse",
    "sheep",
    "cow",
    "elephant",
    "bear",
    "zebra",
    "giraffe",
}


@dataclass
class EventoMudanca:
    tipo: str
    classe: str
    regiao: str
    distancia: str
    quantidade: int = 1
    classe_yolo: str = ""


@dataclass
class EstadoRastreamento:
    confirmados: dict[tuple, Any] = field(default_factory=dict)
    candidatos: dict[tuple, tuple[int, Any]] = field(default_factory=dict)
    ausentes: dict[tuple, int] = field(default_factory=dict)
    eventos_pendentes: list[EventoMudanca] = field(default_factory=list)
    score_pendente: float = 0.0
    pendente_drastica: bool = False
    classes_inanimadas_anunciadas: set[str] = field(default_factory=set)


@dataclass
class DecisaoMudanca:
    deve_falar: bool
    motivo: str
    prioridade: int
    drastica: bool = False
    eventos: list[EventoMudanca] = field(default_factory=list)
    estado_mudanca: EstadoRastreamento | None = None

    @property
    def deve_chamar_llm(self) -> bool:
        return bool(self.deve_falar and self.drastica)


def calcular_score_evento(tipo: str, classe_yolo: str, distancia: str, regiao: str, quantidade: int, cfg_mudanca: dict) -> float:
    pesos_classe = cfg_mudanca.get("pesos_classe", {})
    pesos_dist = cfg_mudanca.get("pesos_distancia", {})

    p_tipo = 1.2 if tipo == "ENTROU" else 0.6 if tipo == "SAIU" else 0.8
    p_classe = pesos_classe.get(classe_yolo, 0.5)
    p_dist = pesos_dist.get(distancia, 0.5)
    p_regiao = 1.0 if regiao == "à frente" else 0.7
    return p_tipo * p_classe * p_dist * p_regiao * quantidade


def _objetos_por_chave(objetos: tuple) -> dict[tuple, Any]:
    resultado = {}
    ocorrencias: Counter = Counter()
    for objeto in objetos:
        id_track = getattr(objeto, "id_track", None)
        if id_track is not None:
            chave = ("track", str(id_track))
        else:
            identidade = (objeto.classe_yolo, objeto.horizontal)
            indice = ocorrencias[identidade]
            ocorrencias[identidade] += 1
            chave = ("fallback", *identidade, indice)
        resultado[chave] = objeto
    return resultado


def _evento_drastico() -> EventoMudanca:
    return EventoMudanca(
        tipo="MUDANCA_DRASTICA",
        classe="ambiente",
        regiao="geral",
        distancia="geral",
    )


def identificar_mudanca(objetos_atuais: tuple, estado_sessao, cfg_mudanca: dict, agora: float) -> DecisaoMudanca:
    if not getattr(estado_sessao, "descricao_inicial_feita", False):
        return DecisaoMudanca(deve_falar=False, motivo="DESCRICAO_INICIAL", prioridade=3)

    objetos_atuais = tuple(objeto for objeto in objetos_atuais if not getattr(objeto, "risco", False))
    rastreamento = getattr(estado_sessao, "estado_mudanca", None)
    atuais = _objetos_por_chave(objetos_atuais)
    if rastreamento is None:
        rastreamento = EstadoRastreamento(
            confirmados=atuais,
            classes_inanimadas_anunciadas={
                objeto.classe_yolo
                for objeto in objetos_atuais
                if not getattr(objeto, "risco", False) and objeto.classe_yolo not in CLASSES_VIVAS
            },
        )
    else:
        rastreamento.confirmados = {
            chave: objeto
            for chave, objeto in rastreamento.confirmados.items()
            if not getattr(objeto, "risco", False)
        }
        rastreamento.candidatos = {
            chave: candidato
            for chave, candidato in rastreamento.candidatos.items()
            if not getattr(candidato[1], "risco", False)
        }

    # O alerta de risco invalida a descrição anterior mesmo que o inventário YOLO
    # ainda não tenha mudado; isso sempre produz um evento acionável.
    if getattr(estado_sessao, "contexto_invalido", False) and not rastreamento.pendente_drastica:
        rastreamento.pendente_drastica = True
        rastreamento.eventos_pendentes.append(_evento_drastico())

    frames_para_entrar = max(1, int(cfg_mudanca.get("frames_para_entrar", 1)))
    frames_para_sair = max(1, int(cfg_mudanca.get("frames_para_sair", 1)))
    confirmados = dict(rastreamento.confirmados)
    candidatos = dict(rastreamento.candidatos)
    ausentes = dict(rastreamento.ausentes)
    eventos_novos: list[EventoMudanca] = []
    score_novo = 0.0
    total_confirmados_antes = len(confirmados)

    for chave, objeto in atuais.items():
        if chave in confirmados:
            confirmados[chave] = objeto
            ausentes.pop(chave, None)
            continue
        candidatos[chave] = (candidatos.get(chave, (0, objeto))[0] + 1, objeto)
        if candidatos[chave][0] >= frames_para_entrar:
            confirmados[chave] = objeto
            candidatos.pop(chave, None)
            eventos_novos.append(
                EventoMudanca(
                    "ENTROU",
                    objeto.classe_pt,
                    objeto.horizontal,
                    objeto.distancia,
                    classe_yolo=objeto.classe_yolo,
                )
            )
            score_novo += calcular_score_evento(
                "ENTROU",
                objeto.classe_yolo,
                objeto.distancia,
                objeto.horizontal,
                1,
                cfg_mudanca,
            )

    for chave in list(candidatos):
        if chave not in atuais:
            candidatos.pop(chave)

    saidas = []
    for chave, objeto in list(confirmados.items()):
        if chave in atuais:
            continue
        ausentes[chave] = ausentes.get(chave, 0) + 1
        if ausentes[chave] >= frames_para_sair:
            saidas.append(objeto)
            confirmados.pop(chave)
            ausentes.pop(chave)

    drastica = bool(
        total_confirmados_antes >= 3
        and len(saidas) / total_confirmados_antes >= float(cfg_mudanca.get("fracao_drastica", 0.70))
    )
    if drastica:
        rastreamento.eventos_pendentes.append(_evento_drastico())
        rastreamento.pendente_drastica = True
        rastreamento.score_pendente = 0.0
    else:
        for objeto in saidas:
            eventos_novos.append(
                EventoMudanca(
                    "SAIU",
                    objeto.classe_pt,
                    objeto.horizontal,
                    objeto.distancia,
                    classe_yolo=objeto.classe_yolo,
                )
            )
            score_novo += calcular_score_evento(
                "SAIU",
                objeto.classe_yolo,
                objeto.distancia,
                objeto.horizontal,
                1,
                cfg_mudanca,
            )
        rastreamento.eventos_pendentes.extend(eventos_novos)
        rastreamento.score_pendente += score_novo

    rastreamento.confirmados = confirmados
    rastreamento.candidatos = candidatos
    rastreamento.ausentes = ausentes

    ultimo_ts = getattr(estado_sessao, "ultimo_ts_fala", None)
    cooldown = float(cfg_mudanca.get("cooldown_informativo_s", 4))
    cooldown_vencido = ultimo_ts is None or agora - ultimo_ts >= cooldown
    limiar = float(cfg_mudanca.get("limiar_score", 0.6))
    pode_falar = rastreamento.pendente_drastica or rastreamento.score_pendente >= limiar
    deve_falar = bool(rastreamento.eventos_pendentes and pode_falar and cooldown_vencido)

    if deve_falar:
        eventos = list(rastreamento.eventos_pendentes)
        drastica = rastreamento.pendente_drastica
        motivo = "MUDANCA_DRASTICA" if drastica else (
            "OBJETO_NOVO" if any(evento.tipo == "ENTROU" for evento in eventos) else "MUDANCA_CENA"
        )
        rastreamento.eventos_pendentes = []
        rastreamento.score_pendente = 0.0
        rastreamento.pendente_drastica = False
        return DecisaoMudanca(
            deve_falar=True,
            motivo=motivo,
            prioridade=3,
            drastica=drastica,
            eventos=eventos,
            estado_mudanca=rastreamento,
        )

    return DecisaoMudanca(
        deve_falar=False,
        motivo="MUDANCA_PENDENTE" if rastreamento.eventos_pendentes else "SEM_MUDANCA",
        prioridade=3,
        estado_mudanca=rastreamento,
    )
