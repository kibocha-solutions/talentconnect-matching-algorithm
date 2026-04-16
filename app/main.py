from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError

from app.api_errors import (
    ApiErrorCode,
    ApiErrorResponse,
    ApiException,
    normalize_validation_errors,
    register_exception_handlers,
)
from app.config import get_settings
from app.embeddings.factory import resolve_provider_metadata
from app.pipeline import MatchingPipelineResult, build_matching_pipeline
from app.schemas import CandidateInput, JobInput


_CANDIDATE_LIST_ADAPTER = TypeAdapter(list[CandidateInput])
_JOB_ADAPTER = TypeAdapter(JobInput)


class MatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    candidates: list[dict[str, Any]] = Field(min_length=1)
    job: dict[str, Any]


class BulkMatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    jobs: list[dict[str, Any]] = Field(min_length=1)
    candidates: list[dict[str, Any]] = Field(min_length=1)


class MatchResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    results: list[dict[str, Any]]
    shortlist_size: int
    retrieval_provider: str
    retrieval_model: str
    retrieval_fallback_used: bool = False


class BulkMatchResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    matches: list[dict[str, Any]]
    candidate_pool_size: int


class ConfigResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    service: str
    api_version: str
    environment: str
    embedding_provider: str
    shortlist_size: int
    endpoints: list[str]


class ModelStatusResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str
    model_loaded: bool
    embedding_provider_configured: bool


app = FastAPI(
    title="TalentConnect Matching Algorithm",
    version="0.1.0",
    description=(
        "Thin internal API over the local TalentConnect matching pipeline. "
        "Authentication and transport hardening are deferred for this sprint."
    ),
)
register_exception_handlers(app)


def get_pipeline():
    try:
        return build_matching_pipeline()
    except FileNotFoundError as exc:
        raise ApiException(
            status_code=503,
            code=ApiErrorCode.MODEL_LOAD_FAILED,
            message="Matching model could not be loaded.",
        ) from exc
    except (OSError, ValueError) as exc:
        if is_model_failure(exc):
            raise ApiException(
                status_code=409,
                code=ApiErrorCode.MODEL_NOT_READY,
                message="Matching model is not ready.",
            ) from exc
        raise


def serialize_pipeline_result(result: MatchingPipelineResult) -> MatchResponse:
    provider_metadata = get_provider_metadata(result.retrieval_result)
    return MatchResponse(
        results=[match_result.model_dump(mode="json") for match_result in result.match_results],
        shortlist_size=len(result.retrieval_result.shortlisted_candidates),
        retrieval_provider=provider_metadata.active_provider,
        retrieval_model=provider_metadata.model_name,
        retrieval_fallback_used=provider_metadata.fallback_triggered,
    )


@app.get("/")
def root() -> dict[str, str]:
    return {
        "service": "talentconnect-matching-algorithm",
        "status": "ok",
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get(
    "/api/internal/config",
    response_model=ConfigResponse,
    responses={500: {"model": ApiErrorResponse}},
)
def api_config() -> ConfigResponse:
    settings = get_settings()
    return ConfigResponse(
        service="talentconnect-matching-algorithm",
        api_version=app.version,
        environment=settings.environment,
        embedding_provider=settings.embedding_provider,
        shortlist_size=settings.shortlist_size,
        endpoints=[
            "GET /",
            "GET /health",
            "GET /api/internal/config",
            "GET /api/internal/model/status",
            "POST /api/internal/match",
            "POST /api/internal/match/bulk",
        ],
    )


@app.get(
    "/api/internal/model/status",
    response_model=ModelStatusResponse,
    responses={409: {"model": ApiErrorResponse}, 503: {"model": ApiErrorResponse}},
)
def model_status() -> ModelStatusResponse:
    try:
        get_pipeline()
    except ApiException as exc:
        if exc.code == ApiErrorCode.MODEL_LOAD_FAILED:
            return ModelStatusResponse(
                status="unavailable",
                model_loaded=False,
                embedding_provider_configured=is_embedding_provider_configured(),
            )
        return ModelStatusResponse(
            status="not_ready",
            model_loaded=False,
            embedding_provider_configured=is_embedding_provider_configured(),
        )

    return ModelStatusResponse(
        status="ready",
        model_loaded=True,
        embedding_provider_configured=is_embedding_provider_configured(),
    )


@app.post(
    "/api/internal/match",
    response_model=MatchResponse,
    responses={400: {"model": ApiErrorResponse}, 500: {"model": ApiErrorResponse}},
)
def match(request: MatchRequest) -> MatchResponse:
    candidates = validate_candidates(request.candidates)
    job = validate_job(request.job)
    pipeline = get_pipeline()
    try:
        result = pipeline.run(candidates, job)
    except Exception as exc:
        raise map_runtime_error(exc) from exc
    return serialize_pipeline_result(result)


@app.post(
    "/api/internal/match/bulk",
    response_model=BulkMatchResponse,
    responses={400: {"model": ApiErrorResponse}, 500: {"model": ApiErrorResponse}},
)
def bulk_match(request: BulkMatchRequest) -> BulkMatchResponse:
    candidates = validate_candidates(request.candidates)
    jobs = validate_jobs(request.jobs)
    pipeline = get_pipeline()
    serialized_matches: list[dict[str, Any]] = []

    for job in jobs:
        try:
            result = pipeline.run(candidates, job)
        except Exception as exc:
            raise map_runtime_error(exc) from exc
        provider_metadata = get_provider_metadata(result.retrieval_result)
        serialized_matches.append(
            {
                "job_id": str(result.job.job_id),
                "results": [match_result.model_dump(mode="json") for match_result in result.match_results],
                "shortlist_size": len(result.retrieval_result.shortlisted_candidates),
                "retrieval_provider": provider_metadata.active_provider,
                "retrieval_model": provider_metadata.model_name,
                "retrieval_fallback_used": provider_metadata.fallback_triggered,
            }
        )

    return BulkMatchResponse(
        matches=serialized_matches,
        candidate_pool_size=len(candidates),
    )


def validate_candidates(candidates: list[dict[str, Any]]) -> list[CandidateInput]:
    try:
        return _CANDIDATE_LIST_ADAPTER.validate_python(candidates)
    except ValidationError as exc:
        raise ApiException(
            status_code=400,
            code=ApiErrorCode.INVALID_CANDIDATE,
            message="Candidate payload failed validation.",
            details={"field_errors": normalize_validation_errors(exc.errors())},
        ) from exc


def validate_job(job: dict[str, Any]) -> JobInput:
    try:
        return _JOB_ADAPTER.validate_python(job)
    except ValidationError as exc:
        raise ApiException(
            status_code=400,
            code=ApiErrorCode.INVALID_JOB,
            message="Job payload failed validation.",
            details={"field_errors": normalize_validation_errors(exc.errors())},
        ) from exc


def validate_jobs(jobs: list[dict[str, Any]]) -> list[JobInput]:
    validated_jobs: list[JobInput] = []
    for index, job in enumerate(jobs):
        try:
            validated_jobs.append(_JOB_ADAPTER.validate_python(job))
        except ValidationError as exc:
            field_errors = normalize_validation_errors(exc.errors())
            for field_error in field_errors:
                field_error["field"] = f"jobs.{index}.{field_error['field']}"
            raise ApiException(
                status_code=400,
                code=ApiErrorCode.INVALID_JOB,
                message="Job payload failed validation.",
                details={"field_errors": field_errors},
            ) from exc
    return validated_jobs


def get_provider_metadata(retrieval_result: Any):
    provider = getattr(retrieval_result, "embedding_provider", retrieval_result)
    return resolve_provider_metadata(provider)


def map_runtime_error(exc: Exception) -> ApiException:
    if is_rate_limit_failure(exc):
        return ApiException(
            status_code=429,
            code=ApiErrorCode.EMBEDDING_RATE_LIMIT,
            message="Embedding provider rate limit reached.",
        )
    if is_embedding_failure(exc):
        return ApiException(
            status_code=503,
            code=ApiErrorCode.EMBEDDING_UNAVAILABLE,
            message="Embedding provider is unavailable.",
        )
    if is_model_failure(exc):
        return ApiException(
            status_code=409,
            code=ApiErrorCode.MODEL_NOT_READY,
            message="Matching model is not ready.",
        )
    return ApiException(
        status_code=500,
        code=ApiErrorCode.INTERNAL_ERROR,
        message="Internal service error.",
    )


def is_rate_limit_failure(exc: Exception) -> bool:
    message = str(exc).lower()
    return "429" in message or "rate limit" in message or "resource exhausted" in message


def is_embedding_failure(exc: Exception) -> bool:
    message = str(exc).lower()
    return any(
        hint in message
        for hint in (
            "embedding",
            "connection",
            "deadline",
            "dns",
            "network",
            "service unavailable",
            "timed out",
            "timeout",
            "transport",
            "unavailable",
        )
    )


def is_model_failure(exc: Exception) -> bool:
    message = str(exc).lower()
    return isinstance(exc, FileNotFoundError) or any(
        hint in message
        for hint in (
            "booster",
            "feature contract",
            "model",
            "metadata",
            str(Path("xgboost-ranker.json")),
        )
    )


def is_embedding_provider_configured() -> bool:
    settings = get_settings()
    return settings.embedding_provider == "local" or bool(settings.gemini_api_key)
