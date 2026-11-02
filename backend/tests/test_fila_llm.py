import threading
import time

from src.farol.fila_llm import FilaLLM
from src.farol.skills import carregar


class ChatFake:
    def __init__(self, texto):
        self.texto = texto

    def __call__(self, **kwargs):
        for parte in [self.texto]:
            yield {"message": {"content": parte}}


def test_fila_llm_prioridade_cancelamento_valida_ocupada():
    skill = {"name": "descrever-ambiente", "model": "qwen2.5vl:3b", "options": {}, "sistema": "Sistema", "usuario": {"": "{{objetos}}"}}
    iniciada = threading.Event()
    liberar = threading.Event()

    def chat(**kwargs):
        iniciada.set()
        liberar.wait(timeout=2)
        yield {"message": {"content": "ok"}}

    fila = FilaLLM(chat=chat)
    try:
        t1 = fila.enfileirar(skill, {"objetos": "cadeira"}, prioridade=2)
        t2 = fila.enfileirar(skill, {"objetos": "mesa"}, prioridade=1)
        assert iniciada.wait(timeout=1)
        assert fila.ocupada_com(2) is True
        fila.cancelar_tudo()
        assert t1.cancelar.is_set() is True
        assert t2.cancelar.is_set() is True
    finally:
        liberar.set()
        fila.parar()


def test_fila_llm_descarta_validacao_false():
    skill = {"name": "responder-pergunta", "model": "qwen2.5vl:3b", "options": {}, "sistema": "Sistema", "usuario": {"": "{{pergunta}}"}}
    fila = FilaLLM(chat=ChatFake("resposta"))
    tarefa = fila.enfileirar(skill, {"pergunta": "qual?"}, prioridade=1, valida=lambda: False)
    time.sleep(0.1)
    assert fila.ocupada_com(1) is False
    fila.parar()


def test_carregar_skills_quando_chamado_apos_fila():
    skills = carregar("skills")
    assert "descrever-ambiente" in skills
    assert "responder-pergunta" in skills
