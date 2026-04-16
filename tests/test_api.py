from __future__ import annotations

from fastapi.testclient import TestClient

from app.api_errors import ERROR_MAPPING, ApiErrorCode
from app.main import app


def test_root_and_docs_endpoints_load() -> None:
    client = TestClient(app)

    root_response = client.get("/")
    docs_response = client.get("/docs")

    assert root_response.status_code == 200
    assert root_response.json()["status"] == "ok"
    assert docs_response.status_code == 200


def test_match_endpoint_accepts_prepared_payload(monkeypatch) -> None:
    client = TestClient(app)

    class StubPipeline:
        def run(self, candidates, job):
            assert len(candidates) == 1
            assert "job_id" in job
            return type(
                "PipelineResult",
                (),
                {
                    "match_results": [
                        type(
                            "MatchResult",
                            (),
                            {
                                "model_dump": lambda self, mode="json": {
                                    "candidate_id": "3303fbcf-c50d-4c18-a7ad-b90fc77c48be",
                                    "job_id": "1c4d6bd3-77a5-4bf5-9baa-f1ef6c9b8e6a",
                                    "overall_score": 95.0,
                                    "score_breakdown": {
                                        "skills_score": 92.0,
                                        "experience_score": 100.0,
                                        "salary_score": 90.0,
                                        "portfolio_score": 100,
                                    },
                                    "matched_at": "2026-04-15T00:00:00Z",
                                }
                            },
                        )()
                    ],
                    "retrieval_result": type(
                        "RetrievalResult",
                        (),
                        {
                            "shortlisted_candidates": [object()],
                            "provider_name": "stub",
                            "model_name": "stub-model",
                        },
                    )(),
                },
            )()

    monkeypatch.setattr("app.main.get_pipeline", lambda: StubPipeline())

    response = client.post(
        "/api/internal/match",
        json={
            "candidates": [
                {
                    "candidate_id": "3303fbcf-c50d-4c18-a7ad-b90fc77c48be",
                    "skills": ["Python"],
                    "years_of_experience": 4,
                    "salary_expectation": {
                        "currency": "USD",
                        "min_amount": 70000,
                        "max_amount": 90000,
                    },
                    "portfolio_projects": [],
                    "extracted_text": "Prepared backend candidate profile with strong API experience.",
                    "video_transcript": "I build backend APIs and platform services every week."
                }
            ],
            "job": {
                "job_id": "1c4d6bd3-77a5-4bf5-9baa-f1ef6c9b8e6a",
                "employer_id": "da1234f7-82f8-4458-947f-7ff920d61160",
                "required_skills": ["Python"],
                "nice_to_have_skills": [],
                "experience_range": {"min_years": 3, "max_years": 5},
                "salary_offered": {
                    "currency": "USD",
                    "min_amount": 70000,
                    "max_amount": 95000
                },
                "job_description_text": "Prepared backend job with matching and API work.",
                "portfolio_required": False
            }
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["shortlist_size"] == 1
    assert payload["retrieval_provider"] == "stub"
    assert payload["results"][0]["overall_score"] == 95.0


def test_bulk_match_endpoint_returns_one_result_set_per_job(monkeypatch) -> None:
    client = TestClient(app)

    class StubPipeline:
        def run(self, candidates, job):
            return type(
                "PipelineResult",
                (),
                {
                    "job": type("Job", (), {"job_id": job["job_id"]})(),
                    "match_results": [
                        type(
                            "MatchResult",
                            (),
                            {
                                "model_dump": lambda self, mode="json": {
                                    "candidate_id": candidates[0]["candidate_id"],
                                    "job_id": job["job_id"],
                                    "overall_score": 88.0,
                                    "score_breakdown": {
                                        "skills_score": 80.0,
                                        "experience_score": 90.0,
                                        "salary_score": 85.0,
                                        "portfolio_score": 30,
                                    },
                                    "matched_at": "2026-04-15T00:00:00Z",
                                }
                            },
                        )()
                    ],
                    "retrieval_result": type(
                        "RetrievalResult",
                        (),
                        {
                            "shortlisted_candidates": [object()],
                            "provider_name": "stub",
                            "model_name": "stub-model",
                        },
                    )(),
                },
            )()

    monkeypatch.setattr("app.main.get_pipeline", lambda: StubPipeline())

    response = client.post(
        "/api/internal/match/bulk",
        json={
            "candidates": [
                {
                    "candidate_id": "3303fbcf-c50d-4c18-a7ad-b90fc77c48be",
                    "skills": ["Python"],
                    "years_of_experience": 4,
                    "salary_expectation": {
                        "currency": "USD",
                        "min_amount": 70000,
                        "max_amount": 90000
                    },
                    "portfolio_projects": [],
                    "extracted_text": "Prepared backend candidate profile with strong API experience.",
                    "video_transcript": "I build backend APIs and platform services every week."
                }
            ],
            "jobs": [
                {
                    "job_id": "1c4d6bd3-77a5-4bf5-9baa-f1ef6c9b8e6a",
                    "employer_id": "da1234f7-82f8-4458-947f-7ff920d61160",
                    "required_skills": ["Python"],
                    "nice_to_have_skills": [],
                    "experience_range": {"min_years": 3, "max_years": 5},
                    "salary_offered": {
                        "currency": "USD",
                        "min_amount": 70000,
                        "max_amount": 95000
                    },
                    "job_description_text": "Prepared backend job with matching and API work.",
                    "portfolio_required": False
                },
                {
                    "job_id": "80242f76-3623-4e87-8a55-a36cb42f97d3",
                    "employer_id": "da1234f7-82f8-4458-947f-7ff920d61160",
                    "required_skills": ["Python"],
                    "nice_to_have_skills": [],
                    "experience_range": {"min_years": 2, "max_years": 4},
                    "salary_offered": {
                        "currency": "USD",
                        "min_amount": 65000,
                        "max_amount": 90000
                    },
                    "job_description_text": "Prepared second backend job for bulk matching.",
                    "portfolio_required": False
                }
            ]
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["candidate_pool_size"] == 1
    assert len(payload["matches"]) == 2
    assert payload["matches"][0]["shortlist_size"] == 1


def test_match_endpoint_rejects_malformed_request_body() -> None:
    client = TestClient(app)

    response = client.post(
        "/api/internal/match",
        json={
            "candidates": [],
            "job": {"job_id": "not-enough-for-a-real-job-payload"},
        },
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload["error"]["code"] == ApiErrorCode.INVALID_REQUEST
    assert payload["error"]["message"] == "Request body failed validation."
    assert payload["error"]["request_id"]
    assert any(
        item["field"].endswith("candidates")
        for item in payload["error"]["details"]["field_errors"]
    )


def test_error_response_uses_request_id_header() -> None:
    client = TestClient(app)

    response = client.post(
        "/api/internal/match",
        headers={"x-request-id": "request-123"},
        json={"candidates": [], "job": {}},
    )

    assert response.status_code == 400
    assert response.json()["error"]["request_id"] == "request-123"


def test_unexpected_error_response_is_sanitized(monkeypatch) -> None:
    client = TestClient(app, raise_server_exceptions=False)

    class FailingPipeline:
        def run(self, candidates, job):
            raise RuntimeError(
                "secret-token stack trace /home/codelf/private/provider-payload"
            )

    monkeypatch.setattr("app.main.get_pipeline", lambda: FailingPipeline())

    response = client.post(
        "/api/internal/match",
        json={
            "candidates": [
                {
                    "candidate_id": "3303fbcf-c50d-4c18-a7ad-b90fc77c48be",
                    "skills": ["Python"],
                    "years_of_experience": 4,
                    "salary_expectation": {
                        "currency": "USD",
                        "min_amount": 70000,
                        "max_amount": 90000,
                    },
                    "portfolio_projects": [],
                    "extracted_text": "Prepared backend candidate profile with strong API experience.",
                    "video_transcript": "I build backend APIs and platform services every week.",
                }
            ],
            "job": {
                "job_id": "1c4d6bd3-77a5-4bf5-9baa-f1ef6c9b8e6a",
                "employer_id": "da1234f7-82f8-4458-947f-7ff920d61160",
                "required_skills": ["Python"],
                "nice_to_have_skills": [],
                "experience_range": {"min_years": 3, "max_years": 5},
                "salary_offered": {
                    "currency": "USD",
                    "min_amount": 70000,
                    "max_amount": 95000,
                },
                "job_description_text": "Prepared backend job with matching and API work.",
                "portfolio_required": False,
            },
        },
    )

    payload_text = response.text
    payload = response.json()

    assert response.status_code == 500
    assert payload["error"]["code"] == ApiErrorCode.INTERNAL_ERROR
    assert payload["error"]["message"] == "Internal service error."
    assert payload["error"]["details"] == {}
    assert "secret-token" not in payload_text
    assert "stack trace" not in payload_text
    assert "/home/codelf" not in payload_text
    assert "provider-payload" not in payload_text


def test_api_error_mapping_defines_frontend_contract() -> None:
    assert ERROR_MAPPING == {
        "malformed_request_body": (
            400,
            "TC-400-INVALID_REQUEST",
            "Request body failed validation.",
        ),
        "invalid_candidate_payload": (
            400,
            "TC-400-INVALID_CANDIDATE",
            "Candidate payload failed validation.",
        ),
        "invalid_job_payload": (
            400,
            "TC-400-INVALID_JOB",
            "Job payload failed validation.",
        ),
        "missing_internal_resource": (
            404,
            "TC-404-NOT_FOUND",
            "Requested resource was not found.",
        ),
        "ranker_or_model_unavailable": (
            409,
            "TC-409-MODEL_NOT_READY",
            "Matching model is not ready.",
        ),
        "embedding_rate_limit_without_fallback": (
            429,
            "TC-429-EMBEDDING_RATE_LIMIT",
            "Embedding provider rate limit reached.",
        ),
        "embedding_unavailable_without_fallback": (
            503,
            "TC-503-EMBEDDING_UNAVAILABLE",
            "Embedding provider is unavailable.",
        ),
        "model_load_failure": (
            503,
            "TC-503-MODEL_LOAD_FAILED",
            "Matching model could not be loaded.",
        ),
        "unexpected_runtime_failure": (
            500,
            "TC-500-INTERNAL_ERROR",
            "Internal service error.",
        ),
    }
