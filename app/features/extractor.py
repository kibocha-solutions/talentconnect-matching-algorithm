from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import ClassVar

from app.embeddings.base import EmbeddingProvider, EmbeddingVector
from app.embeddings.factory import build_embedding_provider
from app.retrieval.retriever import RetrievalCandidate, cosine_similarity
from app.schemas import CandidateInput, JobInput


@dataclass(frozen=True, slots=True)
class CandidateJobFeatures:
    """Structured Phase 2 features for one candidate-job pair."""

    feature_names: ClassVar[tuple[str, ...]] = (
        "required_skill_similarity",
        "nice_to_have_skill_similarity",
        "experience_gap_years",
        "experience_alignment_score",
        "salary_overlap_score",
        "portfolio_score",
        "phase1_similarity_score",
    )

    candidate_id: str
    job_id: str
    required_skill_similarity: float
    nice_to_have_skill_similarity: float
    experience_gap_years: float
    experience_alignment_score: float
    salary_overlap_score: float
    portfolio_score: float
    phase1_similarity_score: float

    def to_vector(self) -> list[float]:
        """Return the stable numeric feature ordering used for models."""

        return [
            self.required_skill_similarity,
            self.nice_to_have_skill_similarity,
            self.experience_gap_years,
            self.experience_alignment_score,
            self.salary_overlap_score,
            self.portfolio_score,
            self.phase1_similarity_score,
        ]


class CandidateJobFeatureExtractor:
    """Extract clean numeric ranking features from prepared candidate-job pairs."""

    def __init__(self, embedding_provider: EmbeddingProvider | None = None) -> None:
        self._embedding_provider = embedding_provider or build_embedding_provider()

    def extract(
        self,
        candidate: CandidateInput,
        job: JobInput,
        phase1_similarity_score: float,
    ) -> CandidateJobFeatures:
        required_skill_similarity = compute_semantic_skill_similarity(
            candidate.skills,
            job.required_skills,
            self._embedding_provider,
        )
        nice_to_have_similarity = compute_semantic_skill_similarity(
            candidate.skills,
            job.nice_to_have_skills,
            self._embedding_provider,
        )
        experience_gap_years = compute_experience_gap_years(candidate, job)
        experience_alignment_score = compute_experience_alignment_score(candidate, job)
        salary_overlap_score = compute_salary_overlap_score(candidate, job)
        portfolio_score = compute_portfolio_score(candidate)

        features = CandidateJobFeatures(
            candidate_id=str(candidate.candidate_id),
            job_id=str(job.job_id),
            required_skill_similarity=required_skill_similarity,
            nice_to_have_skill_similarity=nice_to_have_similarity,
            experience_gap_years=experience_gap_years,
            experience_alignment_score=experience_alignment_score,
            salary_overlap_score=salary_overlap_score,
            portfolio_score=portfolio_score,
            phase1_similarity_score=phase1_similarity_score,
        )
        validate_feature_vector(features.to_vector())
        return features

    def extract_from_retrieval_candidate(
        self,
        retrieval_candidate: RetrievalCandidate,
        job: JobInput,
    ) -> CandidateJobFeatures:
        return self.extract(
            candidate=retrieval_candidate.candidate,
            job=job,
            phase1_similarity_score=retrieval_candidate.similarity_score,
        )


def build_feature_extractor(
    embedding_provider: EmbeddingProvider | None = None,
) -> CandidateJobFeatureExtractor:
    """Create the default feature extractor for ranking preparation."""

    return CandidateJobFeatureExtractor(embedding_provider=embedding_provider)


def compute_semantic_skill_similarity(
    candidate_skills: list[str],
    target_skills: list[str],
    embedding_provider: EmbeddingProvider,
) -> float:
    """Average the best semantic match for each target skill."""

    if not candidate_skills or not target_skills:
        return 0.0

    skill_vectors = embed_skill_texts(
        skill_texts=[*candidate_skills, *target_skills],
        embedding_provider=embedding_provider,
    )
    candidate_vectors = [skill_vectors[skill] for skill in candidate_skills]

    best_match_scores: list[float] = []
    for target_skill in target_skills:
        target_vector = skill_vectors[target_skill]
        target_best_score = max(
            normalize_cosine_score(cosine_similarity(candidate_vector, target_vector))
            for candidate_vector in candidate_vectors
        )
        best_match_scores.append(target_best_score)

    return sum(best_match_scores) / len(best_match_scores)


def embed_skill_texts(
    skill_texts: list[str],
    embedding_provider: EmbeddingProvider,
) -> dict[str, EmbeddingVector]:
    """Embed each unique skill once while preserving original text keys."""

    unique_skill_texts = list(dict.fromkeys(skill_texts))
    vectors = embedding_provider.embed_texts(unique_skill_texts)
    return {
        skill_text: vector
        for skill_text, vector in zip(unique_skill_texts, vectors, strict=True)
    }


def compute_experience_gap_years(candidate: CandidateInput, job: JobInput) -> float:
    """Positive when the candidate exceeds the minimum requirement."""

    return candidate.years_of_experience - job.experience_range.min_years


def compute_experience_alignment_score(candidate: CandidateInput, job: JobInput) -> float:
    """Reward candidates who meet the minimum and stay near the target range."""

    candidate_years = candidate.years_of_experience
    minimum_years = job.experience_range.min_years
    maximum_years = job.experience_range.max_years

    if candidate_years < minimum_years:
        if minimum_years == 0:
            return 0.0
        shortfall_ratio = (minimum_years - candidate_years) / minimum_years
        return max(0.0, 1.0 - shortfall_ratio)

    if candidate_years <= maximum_years:
        return 1.0

    if maximum_years == 0:
        return 1.0

    excess_ratio = (candidate_years - maximum_years) / maximum_years
    return max(0.0, 1.0 - min(excess_ratio, 1.0) * 0.25)


def compute_salary_overlap_score(candidate: CandidateInput, job: JobInput) -> float:
    """Normalize salary band overlap to the candidate expectation width."""

    candidate_salary = candidate.salary_expectation
    job_salary = job.salary_offered

    if candidate_salary.currency != job_salary.currency:
        return 0.0

    overlap_minimum = max(candidate_salary.min_amount, job_salary.min_amount)
    overlap_maximum = min(candidate_salary.max_amount, job_salary.max_amount)
    overlap_width = max(0.0, overlap_maximum - overlap_minimum)

    candidate_width = candidate_salary.max_amount - candidate_salary.min_amount
    if candidate_width == 0:
        candidate_target = candidate_salary.min_amount
        return (
            1.0
            if job_salary.min_amount <= candidate_target <= job_salary.max_amount
            else 0.0
        )

    if overlap_width == 0:
        return 0.0
    return min(1.0, overlap_width / candidate_width)


def compute_portfolio_score(candidate: CandidateInput) -> float:
    """Apply the agreed portfolio heuristic from the PRD."""

    if candidate.portfolio_projects:
        return 100.0
    if candidate.portfolio_url:
        return 30.0
    return 0.0


def normalize_cosine_score(raw_score: float) -> float:
    """Project cosine similarity from [-1, 1] into [0, 1]."""

    return max(0.0, min(1.0, (raw_score + 1.0) / 2.0))


def validate_feature_vector(values: list[float]) -> None:
    """Ensure the vector is fully numeric before model use."""

    if len(values) != len(CandidateJobFeatures.feature_names):
        raise ValueError("Feature vector length does not match the declared schema.")
    if any(not isfinite(value) for value in values):
        raise ValueError("Feature vectors must not contain null, NaN, or inf values.")
