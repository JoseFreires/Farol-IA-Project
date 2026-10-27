from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from typing import Any

import httpx

from .exceptions import OllamaHttpError, OllamaInvalidResponseError, OllamaSchemaValidationError, OllamaTimeoutError, OllamaUnavailableError


@dataclass(frozen=True, slots=True)
class OllamaConfig:
    base_url: str = "http://localhost:11434"
    model: str = "gemma3:4b"
    timeout_seconds: float = 120.0
    max_retries: int = 2
    keep_alive: str = "5m"
    temperature: float = 0.0
    num_ctx: int = 8192
    num_predict: int = 512


class OllamaClient:
    def __init__(self, config: OllamaConfig):
        self.config = config

    async def analyze_image(
        self,
        *,
        image: bytes,
        previous_image: bytes | None = None,
        model: str | None = None,
        system_instructions: str,
        input_data: dict[str, Any],
        output_schema: dict[str, Any],
        correlation_id: str,
    ) -> str:
        images = []
        content = json.dumps(input_data, ensure_ascii=False)
        if previous_image is not None:
            images.append(base64.b64encode(previous_image).decode("utf-8"))
            content += "\nAs imagens anexadas estão nesta ordem: primeiro a imagem anterior, depois a imagem atual. Compare as duas."
        images.append(base64.b64encode(image).decode("utf-8"))

        payload = {
            "model": model or self.config.model,
            "messages": [
                {"role": "system", "content": system_instructions},
                {"role": "user", "content": content, "images": images},
            ],
            "format": output_schema,
            "stream": False,
            "options": {
                "temperature": self.config.temperature,
                "num_ctx": self.config.num_ctx,
                "num_predict": self.config.num_predict,
            },
            "keep_alive": self.config.keep_alive,
        }
        return await self._post(payload, correlation_id)

    async def _post(self, payload: dict[str, Any], correlation_id: str) -> str:
        try:
            async with httpx.AsyncClient(timeout=self.config.timeout_seconds) as client:
                response = await client.post(f"{self.config.base_url}/api/chat", json=payload)
                if response.status_code >= 400:
                    raise OllamaHttpError(f"Ollama retornou status {response.status_code}")
                body = response.json()
                if not body:
                    raise OllamaInvalidResponseError("Resposta vazia do Ollama")
                if "message" not in body or "content" not in body["message"]:
                    raise OllamaInvalidResponseError("Estrutura inválida do Ollama")
                text = body["message"]["content"]
                if not text or not text.strip():
                    raise OllamaInvalidResponseError("Conteúdo vazio do Ollama")
                return text
        except httpx.TimeoutException as exc:
            raise OllamaTimeoutError(f"Timeout do Ollama ({correlation_id})") from exc
        except httpx.HTTPError as exc:
            raise OllamaUnavailableError(f"Ollama indisponível ({correlation_id})") from exc
        except (OllamaHttpError, OllamaInvalidResponseError):
            raise
        except Exception as exc:
            raise OllamaInvalidResponseError(f"Erro ao interpretar resposta do Ollama ({correlation_id})") from exc
