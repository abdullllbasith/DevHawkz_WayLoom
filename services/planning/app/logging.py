from __future__ import annotations

import logging

_LEVELS = {
    "error": logging.ERROR,
    "warn": logging.WARNING,
    "info": logging.INFO,
    "debug": logging.DEBUG,
}


def configure_logging(level: str) -> logging.Logger:
    logging.basicConfig(level=_LEVELS[level], format="%(levelname)s %(name)s %(message)s")
    return logging.getLogger("wayloom.planning")
