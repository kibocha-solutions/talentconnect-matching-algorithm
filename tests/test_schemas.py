from __future__ import annotations

from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas import CandidateInput, ExperienceRange, JobInput, SalaryRange


def build_valid_candidate_payload() -> dict[str, object]:
    return {
        "candidate_id": str(uuid4()),
        "skills": ["Python", " FastAPI ", "python"],
        "years_of_experience": 4.0,
        "salary_expectation": {
            "currency": "usd",
            "min_amount": 60000,
            "max_amount": 90000,
        },
        "portfolio_projects": [],
        "extracted_text": (
            "Experienced backend engineer with platform, API, and matching work."
        ),
        "video_transcript": "I build APIs, improve systems, and mentor teammates.",
    }


def build_valid_job_payload() -> dict[str, object]:
    return {
        "job_id": str(uuid4()),
        "employer_id": str(uuid4()),
        "required_skills": ["Python", "Django", "python"],
        "nice_to_have_skills": [" Machine Learning ", "machine learning"],
        "experience_range": {"min_years": 3, "max_years": 5},
        "salary_offered": {
            "currency": "usd",
            "min_amount": 70000,
            "max_amount": 95000,
        },
        "job_description_text": (
            "Build backend matching services, APIs, and ranking workflows."
        ),
        "portfolio_required": False,
    }


def test_candidate_input_accepts_valid_payload_and_normalizes_fields() -> None:
    candidate = CandidateInput.model_validate(build_valid_candidate_payload())

    assert candidate.skills == ["Python", "FastAPI"]
    assert candidate.salary_expectation == SalaryRange(
        currency="USD",
        min_amount=60000,
        max_amount=90000,
    )
    assert candidate.video_transcript == "I build APIs, improve systems, and mentor teammates."


def test_job_input_accepts_valid_payload_and_normalizes_skill_groups() -> None:
    job = JobInput.model_validate(build_valid_job_payload())

    assert job.required_skills == ["Python", "Django"]
    assert job.nice_to_have_skills == ["Machine Learning"]
    assert job.experience_range == ExperienceRange(min_years=3, max_years=5)
    assert job.salary_offered.currency == "USD"


@pytest.mark.parametrize(
    ("payload_mutator", "expected_message"),
    [
        (
            lambda payload: payload.update(
                salary_expectation={
                    "currency": "USD",
                    "min_amount": 90000,
                    "max_amount": 60000,
                }
            ),
            "max_amount must be greater than or equal to min_amount",
        ),
        (
            lambda payload: payload.update(skills=["", "   "]),
            "skills",
        ),
        (
            lambda payload: payload.update(extracted_text="too short"),
            "extracted_text",
        ),
        (
            lambda payload: payload.update(unexpected_field=True),
            "unexpected_field",
        ),
    ],
)
def test_candidate_input_rejects_invalid_payloads(
    payload_mutator,
    expected_message: str,
) -> None:
    payload = build_valid_candidate_payload()
    payload_mutator(payload)

    with pytest.raises(ValidationError) as error:
        CandidateInput.model_validate(payload)

    assert expected_message in str(error.value)


@pytest.mark.parametrize(
    ("payload_mutator", "expected_message"),
    [
        (
            lambda payload: payload.update(
                experience_range={"min_years": 6, "max_years": 4}
            ),
            "max_years must be greater than or equal to min_years",
        ),
        (
            lambda payload: payload.update(required_skills=[]),
            "required_skills",
        ),
        (
            lambda payload: payload.update(
                salary_offered={
                    "currency": "US",
                    "min_amount": 70000,
                    "max_amount": 95000,
                }
            ),
            "salary_offered.currency",
        ),
        (
            lambda payload: payload.update(job_description_text="short description"),
            "job_description_text",
        ),
    ],
)
def test_job_input_rejects_invalid_payloads(
    payload_mutator,
    expected_message: str,
) -> None:
    payload = build_valid_job_payload()
    payload_mutator(payload)

    with pytest.raises(ValidationError) as error:
        JobInput.model_validate(payload)

    assert expected_message in str(error.value)
