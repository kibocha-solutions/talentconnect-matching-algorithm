from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiErrorCode:
    INVALID_REQUEST = "TC-400-INVALID_REQUEST"
    INVALID_CANDIDATE = "TC-400-INVALID_CANDIDATE"
    INVALID_JOB = "TC-400-INVALID_JOB"
    NOT_FOUND = "TC-404-NOT_FOUND"
    MODEL_NOT_READY = "TC-409-MODEL_NOT_READY"
    EMBEDDING_RATE_LIMIT = "TC-429-EMBEDDING_RATE_LIMIT"
    EMBEDDING_UNAVAILABLE = "TC-503-EMBEDDING_UNAVAILABLE"
    MODEL_LOAD_FAILED = "TC-503-MODEL_LOAD_FAILED"
    INTERNAL_ERROR = "TC-500-INTERNAL_ERROR"


ERROR_MAPPING: dict[str, tuple[int, str, str]] = {
    "malformed_request_body": (
        400,
        ApiErrorCode.INVALID_REQUEST,
        "Request body failed validation.",
    ),
    "invalid_candidate_payload": (
        400,
        ApiErrorCode.INVALID_CANDIDATE,
        "Candidate payload failed validation.",
    ),
    "invalid_job_payload": (
        400,
        ApiErrorCode.INVALID_JOB,
        "Job payload failed validation.",
    ),
    "missing_internal_resource": (
        404,
        ApiErrorCode.NOT_FOUND,
        "Requested resource was not found.",
    ),
    "ranker_or_model_unavailable": (
        409,
        ApiErrorCode.MODEL_NOT_READY,
        "Matching model is not ready.",
    ),
    "embedding_rate_limit_without_fallback": (
        429,
        ApiErrorCode.EMBEDDING_RATE_LIMIT,
        "Embedding provider rate limit reached.",
    ),
    "embedding_unavailable_without_fallback": (
        503,
        ApiErrorCode.EMBEDDING_UNAVAILABLE,
        "Embedding provider is unavailable.",
    ),
    "model_load_failure": (
        503,
        ApiErrorCode.MODEL_LOAD_FAILED,
        "Matching model could not be loaded.",
    ),
    "unexpected_runtime_failure": (
        500,
        ApiErrorCode.INTERNAL_ERROR,
        "Internal service error.",
    ),
}


class ApiErrorBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)
    request_id: str


class ApiErrorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    error: ApiErrorBody


@dataclass(frozen=True, slots=True)
class ApiException(Exception):
    status_code: int
    code: str
    message: str
    details: dict[str, Any] | None = None


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(
        request: Request,
        exc: StarletteHTTPException,
    ) -> JSONResponse:
        if exc.status_code == 404:
            return build_error_response(
                request=request,
                status_code=404,
                code=ApiErrorCode.NOT_FOUND,
                message="Requested resource was not found.",
                details={},
            )
        return build_error_response(
            request=request,
            status_code=exc.status_code,
            code=ApiErrorCode.INVALID_REQUEST,
            message="Request could not be processed.",
            details={},
        )

    @app.exception_handler(RequestValidationError)
    async def handle_request_validation_error(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        return build_error_response(
            request=request,
            status_code=400,
            code=ApiErrorCode.INVALID_REQUEST,
            message="Request body failed validation.",
            details={"field_errors": normalize_validation_errors(exc.errors())},
        )

    @app.exception_handler(ApiException)
    async def handle_api_exception(request: Request, exc: ApiException) -> JSONResponse:
        return build_error_response(
            request=request,
            status_code=exc.status_code,
            code=exc.code,
            message=exc.message,
            details=exc.details or {},
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_exception(request: Request, exc: Exception) -> JSONResponse:
        return build_error_response(
            request=request,
            status_code=500,
            code=ApiErrorCode.INTERNAL_ERROR,
            message="Internal service error.",
            details={},
        )


def build_error_response(
    *,
    request: Request,
    status_code: int,
    code: str,
    message: str,
    details: dict[str, Any],
) -> JSONResponse:
    response = ApiErrorResponse(
        error=ApiErrorBody(
            code=code,
            message=message,
            details=details,
            request_id=get_request_id(request),
        )
    )
    return JSONResponse(status_code=status_code, content=response.model_dump(mode="json"))


def get_request_id(request: Request) -> str:
    request_id = request.headers.get("x-request-id")
    if request_id:
        return request_id
    return str(uuid4())


def normalize_validation_errors(errors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    field_errors: list[dict[str, Any]] = []
    for error in errors:
        field_errors.append(
            {
                "field": ".".join(str(part) for part in error.get("loc", [])),
                "message": str(error.get("msg", "Invalid value.")),
                "type": str(error.get("type", "value_error")),
            }
        )
    return field_errors
