"""Local, user-managed configuration for the provider-neutral model boundary."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from ..core.config import PROJECT_ROOT, Settings, get_settings
from .base import LLMProvider, LLMUnavailableError
from .registry import get_provider


class LocalAIConfig(BaseModel):
    """The only runtime model contract currently exposed by the product UI."""

    model_config = ConfigDict(extra="forbid")

    provider: Literal["openai-compatible"] = "openai-compatible"
    base_url: HttpUrl
    model: str = Field(min_length=1, max_length=160)
    api_key: str | None = Field(default=None, max_length=4096)


class LocalAIConfigInput(LocalAIConfig):
    """Save payload; an omitted key preserves an existing secret."""


def local_ai_config_path() -> Path:
    configured = os.environ.get("RESUME_LOCAL_AI_CONFIG_PATH", "").strip()
    return Path(configured).expanduser() if configured else PROJECT_ROOT / ".cache" / "local-ai.json"


def load_local_ai_config() -> LocalAIConfig | None:
    path = local_ai_config_path()
    if not path.is_file():
        return None
    try:
        return LocalAIConfig.model_validate_json(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def save_local_ai_config(value: LocalAIConfigInput) -> LocalAIConfig:
    path = local_ai_config_path()
    existing = load_local_ai_config()
    payload = value.model_dump(mode="json")
    if not value.api_key and existing and existing.api_key:
        payload["api_key"] = existing.api_key
    saved = LocalAIConfig.model_validate(payload)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(saved.model_dump_json(indent=2), encoding="utf-8")
    os.chmod(temporary, 0o600)
    temporary.replace(path)
    os.chmod(path, 0o600)
    return saved


def effective_local_ai_config(settings: Settings | None = None) -> LocalAIConfig | None:
    stored = load_local_ai_config()
    if stored is not None:
        return stored
    current = settings or get_settings()
    base_url = (current.llm_api_base_url or "").strip()
    model = (current.llm_model or current.openai_model or "").strip()
    key = current.llm_api_key or current.openai_api_key
    is_default_unconfigured = base_url.rstrip("/") == "https://api.openai.com/v1" and not key
    if current.llm_provider not in {"openai", "openai-compatible"} or not base_url or not model or is_default_unconfigured:
        return None
    return LocalAIConfig(
        provider="openai-compatible",
        base_url=base_url,
        model=model,
        api_key=key,
    )


def local_ai_status(settings: Settings | None = None) -> dict[str, object]:
    config = effective_local_ai_config(settings)
    if config is None:
        return {
            "configured": False,
            "provider": "openai-compatible",
            "baseUrl": "",
            "model": "",
            "apiKeyPresent": False,
            "source": "none",
        }
    return {
        "configured": True,
        "provider": config.provider,
        "baseUrl": str(config.base_url).rstrip("/"),
        "model": config.model,
        "apiKeyPresent": bool(config.api_key),
        "source": "settings" if load_local_ai_config() is not None else "environment",
    }


def get_configured_provider(settings: Settings | None = None) -> LLMProvider:
    config = effective_local_ai_config(settings)
    if config is None:
        raise LLMUnavailableError(
            "AI setup is required. Add an OpenAI-compatible endpoint and model in Settings before running resume or scraper pipelines."
        )
    current = settings or get_settings()
    overlaid = current.model_copy(
        update={
            "llm_provider": config.provider,
            "llm_api_base_url": str(config.base_url).rstrip("/"),
            "llm_model": config.model,
            "llm_api_key": config.api_key,
        }
    )
    return get_provider(settings=overlaid)
