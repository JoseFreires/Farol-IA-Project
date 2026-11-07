from __future__ import annotations

import argparse
import json
import textwrap
import time
from pathlib import Path

import cv2
import numpy as np
import yaml
from PIL import Image, ImageDraw, ImageFont

from src.farol.contexto import texto_eventos_python, vars_ambiente
from src.farol.deteccao import DetectorCoco, DetectorDegraus, Percepcao
from src.farol.filtro import montar_base
from src.farol.mudanca.identificar_mudanca import identificar_mudanca
from src.farol.risco.identificar_risco import identificar_risco
from src.farol.risco.trigger import deve_alertar, registrar_alerta
from src.farol.sessao import EstadoRisco, Sessao
from src.farol.skills import executar, carregar


def _ler_cfg(caminho: str | Path) -> dict:
    with open(caminho, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _resumo_objetos(tratados) -> str:
    if not tratados:
        return "nenhum objeto relevante"
    return "; ".join(
        f"{obj.classe_pt} ({obj.horizontal}, {obj.distancia})"
        for obj in tratados[:8]
    )


def _fonte_tela(tamanho: int):
    fontes = (
        Path("C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/segoeui.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    )
    for fonte in fontes:
        if fonte.is_file():
            return ImageFont.truetype(str(fonte), tamanho)
    return ImageFont.load_default()


def _desenhar_deteccoes(frame, bruto, tratados, texto_saida=None):
    h, _ = frame.shape[:2]
    for det in bruto:
        x1, y1, x2, y2 = map(int, [det.x1, det.y1, det.x2, det.y2])
        cor = (0, 0, 255) if det.origem == "degraus" else (0, 255, 0)
        cv2.rectangle(frame, (x1, y1), (x2, y2), cor, 2)
        classe = "escada" if det.origem == "degraus" else det.classe_yolo
        label = f"{classe} {det.conf:.2f}"
        cv2.putText(frame, label, (x1, max(10, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, cor, 1, cv2.LINE_AA)

    rgb = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)).convert("RGBA")
    camada = Image.new("RGBA", rgb.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(camada)
    largura, altura = rgb.size
    margem = max(10, int(largura * 0.01))
    fonte = _fonte_tela(max(16, int(largura * 0.014)))
    largura_texto = max(20, int((largura * 0.72) / max(1, fonte.getlength("M"))))

    resumo = _resumo_objetos(tratados)
    linhas_topo = textwrap.wrap(f"Objetos: {resumo}", width=largura_texto)[:5]
    line_height = max(22, int(fonte.size * 1.35))
    caixa_topo = min(altura - margem, margem + 12 + len(linhas_topo) * line_height)
    draw.rounded_rectangle(
        (margem, margem, int(largura * 0.76), caixa_topo),
        radius=8,
        fill=(0, 0, 0, 175),
    )
    for indice, linha in enumerate(linhas_topo):
        draw.text(
            (margem + 8, margem + 5 + indice * line_height),
            linha,
            font=fonte,
            fill=(255, 230, 70, 255),
        )

    if texto_saida:
        linhas_fala = textwrap.wrap(
            f"Fala: {texto_saida}", width=largura_texto
        )[:4]
        altura_caixa = 12 + len(linhas_fala) * line_height
        topo = max(margem, altura - margem - altura_caixa)
        draw.rounded_rectangle(
            (margem, topo, int(largura * 0.82), altura - margem),
            radius=8,
            fill=(0, 0, 0, 190),
        )
        for indice, linha in enumerate(linhas_fala):
            draw.text(
                (margem + 8, topo + 5 + indice * line_height),
                linha,
                font=fonte,
                fill=(255, 255, 255, 255),
            )

    combinado = Image.alpha_composite(rgb, camada).convert("RGB")
    return cv2.cvtColor(np.array(combinado), cv2.COLOR_RGB2BGR)


def main() -> None:
    parser = argparse.ArgumentParser(description="Monitor de execução do Farol com YOLO e filtro em tempo real.")
    parser.add_argument("--video", type=str, default="gravacoes/gravacao01.mp4", help="caminho para o vídeo de teste")
    parser.add_argument("--config", type=str, default="config/farol.yaml")
    parser.add_argument("--out", type=str, default=None, help="se informado, salva o vídeo anotado em disco")
    parser.add_argument("--show", action="store_true", default=True, help="abre janela para visualização")
    parser.add_argument("--no-show", dest="show", action="store_false", help="não abre janela")
    parser.add_argument("--max-frames", type=int, default=0, help="limita qtos frames processar; 0 = sem limite")
    parser.add_argument("--log-every", type=int, default=5, help="loga resumo a cada N frames")
    args = parser.parse_args()

    cfg = _ler_cfg(args.config)
    detector_coco = DetectorCoco(cfg.get("yolo", {}))
    cfg_degraus = cfg.get("yolo_degraus", {})
    detector_degraus = None
    if cfg_degraus.get("habilitado", False):
        try:
            detector_degraus = DetectorDegraus(cfg_degraus)
        except Exception as exc:
            print(f"[ERRO] Detector de degraus indisponível: {exc}")
    percepcao = Percepcao(detector_coco, detector_degraus)
    skills = carregar(cfg.get("llm", {}).get("pasta_skills", "skills"))

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        raise FileNotFoundError(f"Não foi possível abrir o vídeo: {args.video}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    delay = 1.0 / max(fps, 1.0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    writer = None
    if args.out:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        writer = cv2.VideoWriter(
            str(out_path),
            cv2.VideoWriter_fourcc(*"mp4v"),
            fps,
            (width, height),
        )
        if not writer.isOpened():
            raise RuntimeError(f"Não foi possível criar o vídeo de saída: {args.out}")

    frame_id = 0
    inicio = time.perf_counter()
    texto_saida = None
    origem_texto = None
    sessao = Sessao()
    estado_risco = EstadoRisco()
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            frame_id += 1
            if args.max_frames and frame_id > args.max_frames:
                break

            bruto = percepcao.detectar(frame_id, frame)
            risco_no_frame = False
            cfg_risco = {
                **cfg.get("risco", {}),
                "nomes_pt": cfg_degraus.get("nomes_pt", {}),
            }
            risco_itens = identificar_risco(bruto, cfg_risco)
            for risco in risco_itens:
                if deve_alertar(
                    risco.chave,
                    risco.area_rel,
                    time.time(),
                    estado_risco,
                    float(cfg_risco.get("fator_aproximacao", 1.3)),
                    float(cfg_risco.get("repetir_apos_s", 10)),
                ):
                    registrar_alerta(
                        estado_risco, risco.chave, risco.area_rel, time.time()
                    )
                    texto_saida = risco.mensagem
                    origem_texto = "RISCO"
                    risco_no_frame = True
                    break

            cfg_filtro = {**cfg.get("filtro", {}), "largura": frame.shape[1], "altura": frame.shape[0]}
            tratados = montar_base(bruto, cfg_filtro, cfg_degraus)
            if (
                not risco_no_frame
                and tratados
                and not sessao.estado.descricao_inicial_feita
            ):
                try:
                    variaveis = vars_ambiente(
                        tratados,
                        "",
                        [],
                        {chave: item for chave, item in estado_risco.alertados.items()},
                    )
                    texto_saida = executar(skills["descrever-ambiente"], variaveis, imagem=None, modo="")
                    if texto_saida:
                        origem_texto = "VLM"
                        print(f"[GEMMA] {texto_saida}")
                        sessao.atualizar(
                            descricao_inicial_feita=True,
                            ultima_descricao=texto_saida,
                        )
                    else:
                        texto_saida = None
                except Exception as exc:
                    print(f"[GEMMA_ERRO] {exc}")
                    texto_saida = "Não consegui descrever o ambiente no momento."
                    origem_texto = "ERRO"

            if sessao.estado.descricao_inicial_feita and not risco_no_frame:
                decisao = identificar_mudanca(
                    tratados,
                    sessao.estado,
                    cfg.get("mudanca", {}),
                    time.time(),
                )
                if decisao.estado_mudanca is not None:
                    sessao.atualizar(estado_mudanca=decisao.estado_mudanca)
                if decisao.deve_falar and decisao.eventos:
                    if decisao.deve_chamar_llm:
                        variaveis = vars_ambiente(
                            tratados,
                            sessao.estado.ultima_descricao,
                            decisao.eventos,
                            estado_risco.alertados,
                        )
                        try:
                            texto_saida = executar(
                                skills["descrever-ambiente"],
                                variaveis,
                                imagem=None,
                                modo="atualizacao",
                            )
                            if texto_saida:
                                origem_texto = "VLM"
                                sessao.atualizar(ultima_descricao=texto_saida)
                                print(f"[GEMMA] {texto_saida}")
                            else:
                                texto_saida = "Não consegui descrever a mudança no momento."
                                origem_texto = "ERRO"
                        except Exception as exc:
                            print(f"[GEMMA_ERRO] {exc}")
                            texto_saida = "Não consegui descrever a mudança no momento."
                            origem_texto = "ERRO"
                        sessao.atualizar(ultimo_ts_fala=time.time())
                    else:
                        novo_texto = texto_eventos_python(
                            decisao.eventos,
                            decisao.estado_mudanca.classes_inanimadas_anunciadas
                            if decisao.estado_mudanca is not None
                            else set(),
                        )
                        if novo_texto:
                            texto_saida = novo_texto
                            origem_texto = "SOMENTE_YOLO"
                            sessao.atualizar(ultimo_ts_fala=time.time())
                            print(f"[Mudanca-YOLO] {texto_saida}")
                sessao.atualizar(ultimo_json=tratados)

            frame_anotado = _desenhar_deteccoes(frame.copy(), bruto, tratados, texto_saida)
            if writer is not None:
                writer.write(frame_anotado)

            if frame_id % args.log_every == 0 or frame_id == 1:
                resumo = {
                    "frame": frame_id,
                    "detecoes_brutas": len(bruto),
                    "objetos_tratados": len(tratados),
                    "objetos": [
                        {
                            "classe": obj.classe_yolo,
                            "classe_pt": obj.classe_pt,
                            "horizontal": obj.horizontal,
                            "distancia": obj.distancia,
                            "risco": obj.risco,
                        }
                        for obj in tratados
                    ],
                    "texto": texto_saida,
                    "origem": origem_texto,
                }
                print(json.dumps(resumo, ensure_ascii=False))

            if args.show:
                cv2.imshow("Farol monitor", frame_anotado)
                tecla = cv2.waitKey(1) & 0xFF
                if tecla == 27:
                    break
                time.sleep(delay / 2)

        tempo_total = time.perf_counter() - inicio
        print(f"frames_processados={frame_id} tempo_total={tempo_total:.2f}s fps_aprox={frame_id / tempo_total if tempo_total else 0.0:.2f}")
    finally:
        cap.release()
        if writer is not None:
            writer.release()
        if args.show:
            cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
