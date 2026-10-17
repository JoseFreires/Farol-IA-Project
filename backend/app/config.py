from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    app_token: str
    provedor: Literal["gemini", "ollama"] = "gemini"

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "gemma3:4b"


settings = Settings()