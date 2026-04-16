from __future__ import annotations

from fastapi.testclient import TestClient

from app.api_errors import ERROR_MAPPING, ApiErrorCode
from app.main import app


def valid_candidate_payload() -> dict:
    return {
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


def valid_job_payload(job_id: str = "1c4d6bd3-77a5-4bf5-9baa-f1ef6c9b8e6a") -> dict:
    return {
        "job_id": job_id,
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
    }


def test_root_and_docs_endpoints_load() -> None:
    client = TestClient(app)

    root_response = client.get("/")
    health_response = client.get("/health")
    docs_response = client.get("/docs")

    assert root_response.status_code == 200
    assert root_response.json()["status"] == "ok"
    assert health_response.status_code == 200
    assert health_response.json()["status"] == "ok"
    assert docs_response.status_code == 200


def test_config_endpoint_returns_safe_capability_metadata() -> None:
    client = TestClient(app)

    response = client.get("/api/internal/config")

    payload_text = response.text
    payload = response.json()
    assert response.status_code == 200
    assert payload["service"] == "talentconnect-matching-algorithm"
    assert payload["api_version"] == "0.1.0"
    assert payload["embedding_provider"] in {"gemini", "local"}
    assert payload["shortlist_size"] >= 1
    assert "POST /api/internal/match" in payload["endpoints"]
    assert "GET /api/internal/model/status" in payload["endpoints"]
    assert "GEMINI_API_KEY" not in payload_text
    assert "secret" not in payload_text.lower()
    assert "/home/" not in payload_text


def test_model_status_endpoint_reports_ready(monkeypatch) -> None:
    client = TestClient(app)
    monkeypatch.setattr("app.main.get_pipeline", lambda: object())
    monkeypatch.setattr("app.main.is_embedding_provider_configured", lambda: True)

    response = client.get("/api/internal/model/status")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ready",
        "model_loaded": True,
        "embedding_provider_configured": True,
    }


def test_model_status_endpoint_reports_model_unavailable(monkeypatch) -> None:
    client = TestClient(app)

    def fail_to_build_pipeline():
        raise FileNotFoundError("Model artifact not found: /private/model/path")

    monkeypatch.setattr("app.main.build_matching_pipeline", fail_to_build_pipeline)

    response = client.get("/api/internal/model/status")

    payload = response.json()
    assert response.status_code == 200
    assert payload["status"] == "unavailable"
    assert payload["model_loaded"] is False
    assert "private" not in response.text
    assert "/private/model/path" not in response.text


def test_match_preview_endpoint_is_not_supported() -> None:
    client = TestClient(app)

    response = client.post(
        "/api/internal/match/preview",
        json={"candidates": [valid_candidate_payload()], "job": valid_job_payload()},
    )

    assert response.status_code == 404
    payload = response.json()
    assert payload["error"]["code"] == ApiErrorCode.NOT_FOUND
    assert payload["error"]["message"] == "Requested resource was not found."


def test_unknown_route_uses_structured_not_found_error() -> None:
    client = TestClient(app)

    response = client.get("/api/internal/does-not-exist")

    payload = response.json()
    assert response.status_code == 404
    assert payload["error"]["code"] == ApiErrorCode.NOT_FOUND
    assert payload["error"]["details"] == {}
    assert payload["error"]["request_id"]


def test_wrong_method_uses_structured_error() -> None:
    client = TestClient(app)

    response = client.get("/api/internal/match")

    payload = response.json()
    assert response.status_code == 405
    assert payload["error"]["code"] == ApiErrorCode.INVALID_REQUEST
    assert payload["error"]["message"] == "Request could not be processed."


def test_match_endpoint_rejects_extra_top_level_fields() -> None:
    client = TestClient(app)

    response = client.post(
        "/api/internal/match",
        json={
            "candidates": [valid_candidate_payload()],
            "job": valid_job_payload(),
            "debug": True,
        },
    )

    payload = response.json()
    assert response.status_code == 400
    assert payload["error"]["code"] == ApiErrorCode.INVALID_REQUEST
    assert any(
        item["field"].endswith("debug")
        for item in payload["error"]["details"]["field_errors"]
    )


def test_match_endpoint_rejects_malformed_json() -> None:
    client = TestClient(app)

    response = client.post(
        "/api/internal/match",
        content='{"candidates": [',
        headers={"content-type": "application/json"},
    )

    payload = response.json()
    assert response.status_code == 400
    assert payload["error"]["code"] == ApiErrorCode.INVALID_REQUEST
    assert payload["error"]["request_id"]


def test_bulk_match_endpoint_rejects_empty_jobs() -> None:
    client = TestClient(app)

    response = client.post(
        "/api/internal/match/bulk",
        json={"candidates": [valid_candidate_payload()], "jobs": []},
    )

    payload = response.json()
    assert response.status_code == 400
    assert payload["error"]["code"] == ApiErrorCode.INVALID_REQUEST
    assert any(
        item["field"].endswith("jobs")
        for item in payload["error"]["details"]["field_errors"]
    )


def test_match_endpoint_accepts_prepared_payload(monkeypatch) -> None:
    client = TestClient(app)

    class StubPipeline:
        def run(self, candidates, job):
            assert len(candidates) == 1
            assert str(job.job_id) == "1c4d6bd3-77a5-4bf5-9baa-f1ef6c9b8e6a"
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
            "candidates": [valid_candidate_payload()],
            "job": valid_job_payload(),
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["shortlist_size"] == 1
    assert payload["retrieval_provider"] == "stub"
    assert payload["retrieval_fallback_used"] is False
    assert payload["results"][0]["overall_score"] == 95.0


def test_bulk_match_endpoint_returns_one_result_set_per_job(monkeypatch) -> None:
    client = TestClient(app)

    class StubPipeline:
        def run(self, candidates, job):
            return type(
                "PipelineResult",
                (),
                {
                    "job": type("Job", (), {"job_id": job.job_id})(),
                    "match_results": [
                        type(
                            "MatchResult",
                            (),
                            {
                                "model_dump": lambda self, mode="json": {
                                    "candidate_id": str(candidates[0].candidate_id),
                                    "job_id": str(job.job_id),
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
            "candidates": [valid_candidate_payload()],
            "jobs": [
                valid_job_payload(),
                valid_job_payload("80242f76-3623-4e87-8a55-a36cb42f97d3"),
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
                valid_candidate_payload()
            ],
            "job": valid_job_payload(),
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


def test_match_endpoint_rejects_invalid_candidate_payload() -> None:
    client = TestClient(app)
    candidate = valid_candidate_payload()
    candidate["extracted_text"] = "too short"

    response = client.post(
        "/api/internal/match",
        json={"candidates": [candidate], "job": valid_job_payload()},
    )

    payload = response.json()
    assert response.status_code == 400
    assert payload["error"]["code"] == ApiErrorCode.INVALID_CANDIDATE
    assert payload["error"]["message"] == "Candidate payload failed validation."
    assert any(
        "extracted_text" in item["field"]
        for item in payload["error"]["details"]["field_errors"]
    )


def test_match_endpoint_rejects_invalid_job_payload() -> None:
    client = TestClient(app)
    job = valid_job_payload()
    job["required_skills"] = []

    response = client.post(
        "/api/internal/match",
        json={"candidates": [valid_candidate_payload()], "job": job},
    )

    payload = response.json()
    assert response.status_code == 400
    assert payload["error"]["code"] == ApiErrorCode.INVALID_JOB
    assert payload["error"]["message"] == "Job payload failed validation."
    assert any(
        "required_skills" in item["field"]
        for item in payload["error"]["details"]["field_errors"]
    )


def test_bulk_match_endpoint_identifies_invalid_job_index() -> None:
    client = TestClient(app)
    invalid_job = valid_job_payload("80242f76-3623-4e87-8a55-a36cb42f97d3")
    invalid_job["job_description_text"] = "too short"

    response = client.post(
        "/api/internal/match/bulk",
        json={
            "candidates": [valid_candidate_payload()],
            "jobs": [valid_job_payload(), invalid_job],
        },
    )

    payload = response.json()
    assert response.status_code == 400
    assert payload["error"]["code"] == ApiErrorCode.INVALID_JOB
    assert any(
        item["field"].startswith("jobs.1")
        for item in payload["error"]["details"]["field_errors"]
    )


def test_match_endpoint_maps_model_load_failure(monkeypatch) -> None:
    client = TestClient(app, raise_server_exceptions=False)

    def fail_to_build_pipeline():
        raise FileNotFoundError("Model artifact not found: /private/model/path")

    monkeypatch.setattr("app.main.build_matching_pipeline", fail_to_build_pipeline)

    response = client.post(
        "/api/internal/match",
        json={"candidates": [valid_candidate_payload()], "job": valid_job_payload()},
    )

    payload = response.json()
    assert response.status_code == 503
    assert payload["error"]["code"] == ApiErrorCode.MODEL_LOAD_FAILED
    assert payload["error"]["message"] == "Matching model could not be loaded."
    assert "/private/model/path" not in response.text


def test_match_endpoint_maps_embedding_unavailable(monkeypatch) -> None:
    client = TestClient(app, raise_server_exceptions=False)

    class FailingPipeline:
        def run(self, candidates, job):
            raise RuntimeError("embedding provider transport unavailable")

    monkeypatch.setattr("app.main.get_pipeline", lambda: FailingPipeline())

    response = client.post(
        "/api/internal/match",
        json={"candidates": [valid_candidate_payload()], "job": valid_job_payload()},
    )

    payload = response.json()
    assert response.status_code == 503
    assert payload["error"]["code"] == ApiErrorCode.EMBEDDING_UNAVAILABLE
    assert payload["error"]["message"] == "Embedding provider is unavailable."
    assert "transport unavailable" not in response.text


def test_match_endpoint_maps_embedding_rate_limit(monkeypatch) -> None:
    client = TestClient(app, raise_server_exceptions=False)

    class FailingPipeline:
        def run(self, candidates, job):
            raise RuntimeError("429 rate limit exceeded")

    monkeypatch.setattr("app.main.get_pipeline", lambda: FailingPipeline())

    response = client.post(
        "/api/internal/match",
        json={"candidates": [valid_candidate_payload()], "job": valid_job_payload()},
    )

    payload = response.json()
    assert response.status_code == 429
    assert payload["error"]["code"] == ApiErrorCode.EMBEDDING_RATE_LIMIT
    assert payload["error"]["message"] == "Embedding provider rate limit reached."
    assert "rate limit exceeded" not in response.text


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
