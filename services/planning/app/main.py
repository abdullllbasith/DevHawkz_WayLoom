from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config import load_settings
from app.logging import configure_logging

_HTTP_CODES = {
    404: "not_found",
    405: "method_not_allowed",
    422: "invalid_request",
}


def create_app() -> FastAPI:
    settings = load_settings()
    logger = configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        application.state.settings = settings
        logger.info(
            "Planning service starting on http://%s:%s",
            settings.host,
            settings.port,
        )
        yield
        logger.info("Planning service stopping.")

    application = FastAPI(
        title="WayLoom Planning Service",
        description="Process foundation. Planning and AI are not implemented.",
        version="0.0.0",
        lifespan=lifespan,
    )
    application.state.settings = settings
    application.state.logger = logger

    @application.exception_handler(HTTPException)
    async def http_exception_handler(
        request: Request,
        exc: HTTPException,
    ) -> JSONResponse:
        del request
        message = exc.detail if isinstance(exc.detail, str) else "Request failed."
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": _HTTP_CODES.get(exc.status_code, "http_error"),
                    "message": message,
                }
            },
        )

    @application.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        del request, exc
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "invalid_request",
                    "message": "Invalid request.",
                }
            },
        )

    @application.exception_handler(Exception)
    async def unexpected_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        del request
        if settings.node_env == "development":
            logger.exception("Unexpected planning service error.", exc_info=exc)
        else:
            logger.error("Unexpected planning service error.")
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "internal_error",
                    "message": "Internal server error.",
                }
            },
        )

    @application.api_route(
        "/health",
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
    )
    def health(request: Request) -> dict[str, str]:
        if request.method != "GET":
            raise HTTPException(status_code=405, detail="Method not allowed.")
        return {"status": "ok"}

    @application.api_route(
        "/{full_path:path}",
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
        include_in_schema=False,
    )
    def unknown(full_path: str) -> None:
        del full_path
        raise HTTPException(status_code=404, detail="Not found.")

    return application


app = create_app()
