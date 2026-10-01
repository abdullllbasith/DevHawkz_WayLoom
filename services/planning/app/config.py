from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

NODE_ENVIRONMENTS = ("development", "test", "production")
LOG_LEVELS = ("error", "warn", "info", "debug")
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8000


class ConfigError(Exception):
    """Raised when the planning service cannot start with the current environment."""


@dataclass(frozen=True)
class Settings:
    node_env: str
    host: str
    port: int
    log_level: str


def load_settings() -> Settings:
    _load_repository_env()
    node_env = _parse_node_env(os.environ.get("NODE_ENV"))
    return Settings(
        node_env=node_env,
        host=_parse_host(os.environ.get("PLANNING_HOST"), node_env),
        port=_parse_port(os.environ.get("PLANNING_PORT"), node_env),
        log_level=_parse_log_level(os.environ.get("LOG_LEVEL")),
    )


def _load_repository_env() -> None:
    env_path = Path(__file__).resolve().parents[3] / ".env"
    if not env_path.is_file():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key or key in os.environ:
            continue
        os.environ[key] = value.strip().strip('"').strip("'")


def _parse_node_env(value: str | None) -> str:
    if value in NODE_ENVIRONMENTS:
        return value
    raise ConfigError(
        "Invalid configuration: NODE_ENV must be development, test, or production."
    )


def _parse_host(value: str | None, node_env: str) -> str:
    if value is None or value == "":
        if node_env == "production":
            raise ConfigError(
                "Invalid configuration: PLANNING_HOST is required when NODE_ENV is production."
            )
        return DEFAULT_HOST
    if value.strip() == "":
        raise ConfigError("Invalid configuration: PLANNING_HOST must not be blank.")
    return value


def _parse_port(value: str | None, node_env: str) -> int:
    if value is None or value == "":
        if node_env == "production":
            raise ConfigError(
                "Invalid configuration: PLANNING_PORT is required when NODE_ENV is production."
            )
        return DEFAULT_PORT
    if not value.isdecimal():
        raise ConfigError(
            "Invalid configuration: PLANNING_PORT must be an integer from 1 to 65535."
        )
    port = int(value)
    if port < 1 or port > 65535:
        raise ConfigError(
            "Invalid configuration: PLANNING_PORT must be an integer from 1 to 65535."
        )
    return port


def _parse_log_level(value: str | None) -> str:
    if value is None or value == "":
        return "info"
    if value in LOG_LEVELS:
        return value
    raise ConfigError(
        "Invalid configuration: LOG_LEVEL must be error, warn, info, or debug."
    )
