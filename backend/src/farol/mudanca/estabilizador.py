from __future__ import annotations

import logging
from dataclasses import dataclass, replace
from typing import Sequence

from src.farol.contratos import ObjetoTratado


logger = logging.getLogger(__name__)


@dataclass
class _EstadoObjeto:
    objeto: ObjetoTratado
    presencas: int = 1
    ausencias: int = 0
    rotulo_pendente: tuple[str, str] | None = None
    rotulo_frames: int = 0


class Estabilizador:
    def __init__(self) -> None:
        self._objetos: dict[tuple, _EstadoObjeto] = {}

    @staticmethod
    def _chaves(tratados: Sequence[ObjetoTratado]) -> list[tuple[ObjetoTratado, tuple]]:
        ocorrencias: dict[tuple[str, str], int] = {}
        saida: list[tuple[ObjetoTratado, tuple]] = []
        sem_track = 0
        for objeto in tratados:
            if objeto.origem == "degraus":
                identidade = (objeto.classe_yolo, objeto.horizontal)
                indice = ocorrencias.get(identidade, 0)
                ocorrencias[identidade] = indice + 1
                chave = ("degrau", *identidade, indice)
            elif objeto.id_track is not None:
                chave = ("track", str(objeto.id_track))
            else:
                sem_track += 1
                continue
            saida.append((objeto, chave))
        if sem_track:
            logger.debug("Ignoradas %d detecções COCO sem id_track.", sem_track)
        return saida

    def atualizar(
        self, tratados: Sequence[ObjetoTratado], cfg: dict
    ) -> tuple[ObjetoTratado, ...]:
        frames_entrada = max(1, int(cfg.get("frames_para_entrar", 1)))
        frames_saida = max(1, int(cfg.get("frames_para_sair", 1)))
        atuais = self._chaves(tratados)
        chaves_atuais = {chave for _, chave in atuais}
        saida: dict[tuple, ObjetoTratado] = {}

        for objeto, chave in atuais:
            estado = self._objetos.get(chave)
            if estado is None:
                estado = _EstadoObjeto(objeto=objeto)
                if frames_entrada <= 1:
                    self._objetos[chave] = estado
                    saida[chave] = objeto
                else:
                    self._objetos[chave] = estado
                continue

            estado.ausencias = 0
            rotulo_atual = (estado.objeto.horizontal, estado.objeto.distancia)
            rotulo_novo = (objeto.horizontal, objeto.distancia)
            if rotulo_novo == rotulo_atual:
                estado.rotulo_pendente = None
                estado.rotulo_frames = 0
            else:
                if estado.rotulo_pendente == rotulo_novo:
                    estado.rotulo_frames += 1
                else:
                    estado.rotulo_pendente = rotulo_novo
                    estado.rotulo_frames = 1
                if estado.rotulo_frames >= frames_entrada:
                    estado.objeto = replace(
                        estado.objeto,
                        horizontal=objeto.horizontal,
                        distancia=objeto.distancia,
                    )
                    estado.rotulo_pendente = None
                    estado.rotulo_frames = 0

            estado.objeto = replace(
                estado.objeto,
                area_rel=objeto.area_rel,
                bbox=objeto.bbox,
                frame_id=objeto.frame_id,
                id_track=objeto.id_track,
            )
            if estado.presencas < frames_entrada:
                estado.presencas += 1
            if estado.presencas >= frames_entrada:
                self._objetos[chave] = estado
                saida[chave] = estado.objeto

        for chave, estado in list(self._objetos.items()):
            if chave in chaves_atuais:
                continue
            if estado.presencas < frames_entrada:
                del self._objetos[chave]
                continue
            estado.ausencias += 1
            if estado.ausencias >= frames_saida:
                del self._objetos[chave]
            else:
                saida[chave] = estado.objeto

        return tuple(saida.values())
