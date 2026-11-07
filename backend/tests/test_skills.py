from pathlib import Path

import pytest

from src.farol import skills


ROOT = Path(__file__).resolve().parent.parent


def test_carregar_skills_reais():
    skill_map = skills.carregar(str(ROOT / "skills"))
    assert set(skill_map) == {"descrever-ambiente", "responder-pergunta"}
    for nome, skill in skill_map.items():
        assert skill["name"] == nome
        assert skill["model"] == "qwen2.5vl:3b"
        assert "## Sistema" not in skill["sistema"]
        assert "{{" not in skill["sistema"]
        assert "## Usuario" not in skill["usuario"][""]
        assert "{{objetos}}" in skill["usuario"][""] or "{{contexto}}" in skill["usuario"][""]


def test_frontmatter_comentarios_inline_sao_aceitos():
    for nome in ("descrever-ambiente", "responder-pergunta"):
        text = (ROOT / "skills" / nome / "SKILL.md").read_text(encoding="utf-8")
        assert "#" in text
        skill = skills.carregar(str(ROOT / "skills"))[nome]
        assert skill["model"] == "qwen2.5vl:3b"


def test_sistema_nao_aceita_variavel(tmp_path):
    pasta = tmp_path / "bad_skill"
    pasta.mkdir()
    (pasta / "SKILL.md").write_text(
        """---
name: bad_skill
description: teste
version: 1
model: qwen2.5vl:3b
---

## Sistema

Mensagem com {{variavel}}

## Usuario

{{pergunta}}
""",
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="Sistema"):
        skills.carregar(str(tmp_path))


def test_descricao_remove_alertas_nao_emitidos_pelo_detector():
    skill = {
        "name": "descrever-ambiente",
        "model": "qwen2.5vl:3b",
        "options": {},
        "sistema": "Sistema",
        "usuario": {"": "{{objetos}}"},
    }

    resultado = skills.executar(
        skill,
        {"objetos": "Há uma cadeira à direita."},
        chat=ChatFake("À sua direita há uma cadeira. Atenção, há uma cadeira à direita."),
    )

    assert resultado == "À sua direita há uma cadeira."


def test_descricao_corrige_posicao_usando_fatos_do_yolo():
    skill = {
        "name": "descrever-ambiente",
        "model": "qwen2.5vl:3b",
        "options": {},
        "sistema": "Sistema",
        "usuario": {"": "{{objetos}}"},
    }

    resultado = skills.executar(
        skill,
        {
            "objetos": (
                "Há uma geladeira à esquerda, um micro-ondas à esquerda, "
                "uma cadeira à esquerda e outra cadeira à direita."
            ),
            "posicoes_yolo": {
                "geladeira": ["à esquerda"],
                "micro-ondas": ["à esquerda"],
                "cadeira": ["à esquerda", "à direita"],
            },
        },
        chat=ChatFake(
            "À sua esquerda, há uma geladeira e um micro-ondas. "
            "À sua frente, há uma cadeira. À sua direita, há outra cadeira."
        ),
    )

    assert resultado == (
        "À sua esquerda, há uma geladeira e um micro-ondas. "
        "À sua esquerda, há uma cadeira. À sua direita, há outra cadeira."
    )


def test_executar_mantem_modelo_carregado():
    chamadas = []

    def chat(**kwargs):
        chamadas.append(kwargs)
        yield {"message": {"content": "Texto."}}

    skills.executar(
        {
            "name": "responder-pergunta",
            "model": "qwen2.5vl:3b",
            "options": {},
            "sistema": "Sistema",
            "usuario": {"": "{{pergunta}}"},
        },
        {"pergunta": "Onde está?"},
        chat=chat,
    )

    assert chamadas[0]["keep_alive"] == "30m"


class ChatFake:
    def __init__(self, texto):
        self.texto = texto

    def __call__(self, **kwargs):
        yield {"message": {"content": self.texto}}
