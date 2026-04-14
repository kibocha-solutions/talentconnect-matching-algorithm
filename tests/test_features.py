from __future__ import annotations

from uuid import uuid4

from app.embeddings.base import EmbeddingBatch, EmbeddingProvider, EmbeddingVector
from app.features.extractor import (
    CandidateJobFeatureExtractor,
    CandidateJobFeatures,
    compute_portfolio_score,
    compute_salary_overlap_score,
)
from app.schemas import CandidateInput, ExperienceRange, JobInput, PortfolioProject, SalaryRange


class StubEmbeddingProvider(EmbeddingProvider):
    def __init__(self, vectors: dict[str, EmbeddingVector]) -> None:
        self._vectors = vectors

    @property
    def provider_name(self) -> str:
        return "stub"

    def embed_text(self, text: str) -> EmbeddingVector:
        return self._vectors[text]

    def embed_texts(self, texts: list[str]) -> EmbeddingBatch:
        return [self._vectors[text] for text in texts]


def build_candidate(
    *,
    skills: list[str] | None = None,
    years_of_experience: float = 4.0,
    salary_min: float = 60000.0,
    salary_max: float = 90000.0,
    portfolio_url: str | None = None,
    portfolio_projects: list[PortfolioProject] | None = None,
) -> CandidateInput:
    return CandidateInput(
        candidate_id=uuid4(),
        skills=skills or ["Python", "FastAPI"],
        years_of_experience=years_of_experience,
        salary_expectation=SalaryRange(
            currency="usd",
            min_amount=salary_min,
            max_amount=salary_max,
        ),
        portfolio_url=portfolio_url,
        portfolio_projects=portfolio_projects or [],
        extracted_text="Experienced backend engineer with API and platform work.",
        video_transcript="Build services, improve APIs, and mentor engineers.",
    )


def build_job(
    *,
    required_skills: list[str] | None = None,
    nice_to_have_skills: list[str] | None = None,
    min_years: float = 3.0,
    max_years: float = 5.0,
    salary_min: float = 70000.0,
    salary_max: float = 100000.0,
) -> JobInput:
    return JobInput(
        job_id=uuid4(),
        employer_id=uuid4(),
        required_skills=required_skills or ["Python", "Django"],
        nice_to_have_skills=nice_to_have_skills or ["Machine Learning"],
        experience_range=ExperienceRange(min_years=min_years, max_years=max_years),
        salary_offered=SalaryRange(
            currency="USD",
            min_amount=salary_min,
            max_amount=salary_max,
        ),
        job_description_text=(
            "Build matching systems with Python services, APIs, and ranking logic."
        ),
        portfolio_required=False,
    )


def test_extractor_returns_complete_stable_feature_vector() -> None:
    embedding_provider = StubEmbeddingProvider(
        {
            "Python": [1.0, 0.0],
            "FastAPI": [0.9, 0.1],
            "Django": [0.95, 0.05],
            "Machine Learning": [0.0, 1.0],
        }
    )
    extractor = CandidateJobFeatureExtractor(embedding_provider=embedding_provider)
    candidate = build_candidate(
        portfolio_url="https://portfolio.example.com",
        portfolio_projects=[
            PortfolioProject(
                title="Matching Pipeline",
                description="Built a ranking pipeline with semantic retrieval and APIs.",
                technologies=["Python", "FastAPI"],
                url="https://portfolio.example.com/matching",
            )
        ],
    )
    job = build_job()

    features = extractor.extract(candidate, job, phase1_similarity_score=0.87)

    assert features.candidate_id == str(candidate.candidate_id)
    assert features.job_id == str(job.job_id)
    assert features.feature_names == CandidateJobFeatures.feature_names
    assert features.phase1_similarity_score == 0.87
    assert features.portfolio_score == 100.0
    assert len(features.to_vector()) == len(CandidateJobFeatures.feature_names)
    assert all(value is not None for value in features.to_vector())
    assert features.required_skill_similarity > features.nice_to_have_skill_similarity


def test_salary_overlap_score_is_normalized_to_candidate_expectation_band() -> None:
    candidate = build_candidate(salary_min=60000.0, salary_max=90000.0)
    job = build_job(salary_min=75000.0, salary_max=105000.0)

    score = compute_salary_overlap_score(candidate, job)

    assert score == 0.5


def test_portfolio_score_follows_prd_heuristic() -> None:
    no_portfolio_candidate = build_candidate()
    url_only_candidate = build_candidate(portfolio_url="https://portfolio.example.com")
    project_candidate = build_candidate(
        portfolio_url="https://portfolio.example.com",
        portfolio_projects=[
            PortfolioProject(
                title="Portfolio App",
                description="Created a polished portfolio site with deployed examples.",
                technologies=["Python"],
            )
        ],
    )

    assert compute_portfolio_score(no_portfolio_candidate) == 0.0
    assert compute_portfolio_score(url_only_candidate) == 30.0
    assert compute_portfolio_score(project_candidate) == 100.0
