from __future__ import annotations

import sys

import uvicorn

from app.config import ConfigError, load_settings
from app.logging import configure_logging


def main() -> None:
    try:
        settings = load_settings()
    except ConfigError as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from None

    configure_logging(settings.log_level)
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.node_env == "development",
    )


if __name__ == "__main__":
    main()
