from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from app.features.extractor import CandidateJobFeatureExtractor
from app.pipeline import TalentConnectMatchingPipeline
from app.ranking.ranker import XGBoostMatchRanker
from app.ranking.trainer import XGBoostRankingTrainer, build_training_examples
from app.retrieval.retriever import InMemorySemanticRetriever
from app.schemas import CandidateInput, ExperienceRange, JobInput, PortfolioProject, SalaryRange


class StubEmbeddingProvider:
    def __init__(self, vectors: dict[str, list[float]]) -> None:
        self._vectors = vectors
        self.model_name = "stub-embedding-model"

    @property
    def provider_name(self) -> str:
        return "stub"

    def embed_text(self, text: str) -> list[float]:
        return self._vectors[text]

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        return [self._vectors[text] for text in texts]


def build_candidate(
    *,
    skills: list[str],
    years_of_experience: float,
    salary_min: float,
    salary_max: float,
    portfolio_url: str | None = None,
    portfolio_projects: list[PortfolioProject] | None = None,
    extracted_text: str = "Prepared candidate profile with backend and API experience.",
) -> CandidateInput:
    return CandidateInput(
        candidate_id=uuid4(),
        skills=skills,
        years_of_experience=years_of_experience,
        salary_expectation=SalaryRange(
            currency="USD",
            min_amount=salary_min,
            max_amount=salary_max,
        ),
        portfolio_url=portfolio_url,
        portfolio_projects=portfolio_projects or [],
        extracted_text=extracted_text,
        video_transcript="Prepared candidate introduction transcript for matching.",
    )


def build_job() -> JobInput:
    return JobInput(
        job_id=uuid4(),
        employer_id=uuid4(),
        required_skills=["Python", "Django"],
        nice_to_have_skills=["Machine Learning"],
        experience_range=ExperienceRange(min_years=3.0, max_years=5.0),
        salary_offered=SalaryRange(currency="USD", min_amount=70000.0, max_amount=95000.0),
        job_description_text=(
            "Build matching services with Python, APIs, ranking logic, and platform care."
        ),
        portfolio_required=False,
    )


def build_pipeline(tmp_path: Path) -> TalentConnectMatchingPipeline:
    trainer = XGBoostRankingTrainer(model_dir=tmp_path / "models", num_boost_round=12)
    trained_model = trainer.fit_and_save(
        build_training_examples(
            [
                {
                    "candidate_id": str(uuid4()),
                    "job_id": str(uuid4()),
                    "required_skill_similarity": 0.95,
                    "nice_to_have_skill_similarity": 0.8,
                    "experience_gap_years": 1.5,
                    "experience_alignment_score": 1.0,
                    "salary_overlap_score": 0.9,
                    "portfolio_score": 100.0,
                    "phase1_similarity_score": 0.93,
                    "label": 1.0,
                },
                {
                    "candidate_id": str(uuid4()),
                    "job_id": str(uuid4()),
                    "required_skill_similarity": 0.35,
                    "nice_to_have_skill_similarity": 0.2,
                    "experience_gap_years": -1.5,
                    "experience_alignment_score": 0.35,
                    "salary_overlap_score": 0.2,
                    "portfolio_score": 0.0,
                    "phase1_similarity_score": 0.32,
                    "label": 0.0,
                },
            ]
        )
    )

    candidate_strong = build_candidate(
        skills=["Python", "FastAPI"],
        years_of_experience=4.0,
        salary_min=72000.0,
        salary_max=90000.0,
        portfolio_url="https://portfolio.example.com",
        portfolio_projects=[
            PortfolioProject(
                title="Matching Pipeline",
                description="Built a ranking pipeline with retrieval and scoring layers.",
                technologies=["Python", "FastAPI"],
            )
        ],
    )
    candidate_weak = build_candidate(
        skills=["Excel", "WordPress"],
        years_of_experience=1.0,
        salary_min=95000.0,
        salary_max=120000.0,
        extracted_text="Prepared candidate profile with unrelated skills and short experience.",
    )
    job = build_job()

    vectors = {
        "Required skills: Python, Django\nNice to have skills: Machine Learning\nExperience range: 3.0-5.0 years\nSalary offered: USD 70000.00-95000.00\nPortfolio: not required\nJob description: Build matching services with Python, APIs, ranking logic, and platform care.": [
            1.0,
            0.0,
        ],
        "Skills: Python, FastAPI\nExperience: 4.0 years\nSalary expectation: USD 72000.00-90000.00\nResume summary: Prepared candidate profile with backend and API experience.\nVideo transcript: Prepared candidate introduction transcript for matching.\nPortfolio URL: https://portfolio.example.com\nPortfolio: Matching Pipeline. Built a ranking pipeline with retrieval and scoring layers.. Technologies: Python, FastAPI": [
            0.98,
            0.02,
        ],
        "Skills: Excel, WordPress\nExperience: 1.0 years\nSalary expectation: USD 95000.00-120000.00\nResume summary: Prepared candidate profile with unrelated skills and short experience.\nVideo transcript: Prepared candidate introduction transcript for matching.": [
            0.1,
            0.9,
        ],
        "Python": [1.0, 0.0],
        "FastAPI": [0.92, 0.08],
        "Excel": [0.0, 1.0],
        "WordPress": [0.1, 0.9],
        "Django": [0.95, 0.05],
        "Machine Learning": [0.0, 1.0],
    }
    embedding_provider = StubEmbeddingProvider(vectors)
    retriever = InMemorySemanticRetriever(embedding_provider=embedding_provider, shortlist_size=2)
    extractor = CandidateJobFeatureExtractor(embedding_provider=embedding_provider)
    ranker = XGBoostMatchRanker(trained_model=trained_model, model_dir=tmp_path / "models")

    return TalentConnectMatchingPipeline(
        retriever=retriever,
        feature_extractor=extractor,
        ranker=ranker,
    ), [candidate_strong, candidate_weak], job


def test_pipeline_runs_end_to_end_and_returns_ranked_results(tmp_path: Path) -> None:
    pipeline, candidates, job = build_pipeline(tmp_path)

    result = pipeline.run(candidates, job)

    assert len(result.validated_candidates) == 2
    assert len(result.retrieval_result.shortlisted_candidates) == 2
    assert len(result.feature_rows) == 2
    assert len(result.ranked_rows) == 2
    assert len(result.match_results) == 2
    assert result.match_results[0].overall_score >= result.match_results[1].overall_score
    assert result.ranked_rows[0].features.candidate_id == str(candidates[0].candidate_id)


def test_pipeline_accepts_dict_inputs_and_can_preview_text(tmp_path: Path) -> None:
    pipeline, candidates, job = build_pipeline(tmp_path)
    candidate = candidates[0].model_dump(mode="python")
    job = job.model_dump(mode="python")

    result = pipeline.run([candidate], job)

    assert len(result.match_results) == 1
    assert "Skills:" in pipeline.preview_candidate_text(candidate)
    assert "Required skills:" in pipeline.preview_job_text(job)
