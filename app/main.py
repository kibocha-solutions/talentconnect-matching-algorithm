from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict, Field

from app.pipeline import MatchingPipelineResult, build_matching_pipeline


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


class BulkMatchResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    matches: list[dict[str, Any]]
    candidate_pool_size: int


app = FastAPI(
    title="TalentConnect Matching Algorithm",
    version="0.1.0",
    description=(
        "Thin internal API over the local TalentConnect matching pipeline. "
        "Authentication and transport hardening are deferred for this sprint."
    ),
)


def get_pipeline():
    return build_matching_pipeline()


def serialize_pipeline_result(result: MatchingPipelineResult) -> MatchResponse:
    return MatchResponse(
        results=[match_result.model_dump(mode="json") for match_result in result.match_results],
        shortlist_size=len(result.retrieval_result.shortlisted_candidates),
        retrieval_provider=result.retrieval_result.provider_name,
        retrieval_model=result.retrieval_result.model_name,
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


@app.post("/api/internal/match", response_model=MatchResponse)
def match(request: MatchRequest) -> MatchResponse:
    pipeline = get_pipeline()
    result = pipeline.run(request.candidates, request.job)
    return serialize_pipeline_result(result)


@app.post("/api/internal/match/bulk", response_model=BulkMatchResponse)
def bulk_match(request: BulkMatchRequest) -> BulkMatchResponse:
    pipeline = get_pipeline()
    serialized_matches: list[dict[str, Any]] = []

    for job in request.jobs:
        result = pipeline.run(request.candidates, job)
        serialized_matches.append(
            {
                "job_id": str(result.job.job_id),
                "results": [match_result.model_dump(mode="json") for match_result in result.match_results],
                "shortlist_size": len(result.retrieval_result.shortlisted_candidates),
                "retrieval_provider": result.retrieval_result.provider_name,
                "retrieval_model": result.retrieval_result.model_name,
            }
        )

    return BulkMatchResponse(
        matches=serialized_matches,
        candidate_pool_size=len(request.candidates),
    )
