from __future__ import annotations

from dataclasses import dataclass
from math import sqrt

from app.config import get_settings
from app.embeddings.base import EmbeddingProvider, EmbeddingVector
from app.embeddings.factory import build_embedding_provider
from app.schemas import CandidateInput, JobInput


@dataclass(frozen=True, slots=True)
class RetrievalCandidate:
    """Candidate plus phase-1 semantic similarity for downstream ranking."""

    candidate: CandidateInput
    similarity_score: float


@dataclass(frozen=True, slots=True)
class RetrievalResult:
    """Phase-1 shortlist returned by the semantic retriever."""

    job: JobInput
    shortlisted_candidates: list[RetrievalCandidate]
    provider_name: str
    model_name: str
    shortlist_size_limit: int
    embedding_provider: EmbeddingProvider


class InMemorySemanticRetriever:
    """Generate an in-memory semantic shortlist for prepared candidates and jobs."""

    def __init__(
        self,
        embedding_provider: EmbeddingProvider | None = None,
        shortlist_size: int | None = None,
    ) -> None:
        settings = get_settings()
        self._embedding_provider = embedding_provider or build_embedding_provider()
        self._shortlist_size = shortlist_size or settings.shortlist_size

    @property
    def provider_name(self) -> str:
        return self._embedding_provider.provider_name

    @property
    def model_name(self) -> str:
        return getattr(self._embedding_provider, "model_name", "unknown")

    @property
    def shortlist_size(self) -> int:
        return self._shortlist_size

    def shortlist(
        self,
        candidates: list[CandidateInput],
        job: JobInput,
    ) -> RetrievalResult:
        if not candidates:
            return RetrievalResult(
                job=job,
                shortlisted_candidates=[],
                provider_name=self.provider_name,
                model_name=self.model_name,
                shortlist_size_limit=self.shortlist_size,
                embedding_provider=self._embedding_provider,
            )

        job_text = assemble_job_text(job)
        candidate_texts = [assemble_candidate_text(candidate) for candidate in candidates]

        job_embedding = self._embedding_provider.embed_text(job_text)
        candidate_embeddings = self._embedding_provider.embed_texts(candidate_texts)

        if len(candidate_embeddings) != len(candidates):
            raise ValueError(
                "Embedding provider returned a different number of candidate vectors."
            )

        ranked_candidates = sorted(
            (
                RetrievalCandidate(
                    candidate=candidate,
                    similarity_score=cosine_similarity(
                        candidate_embedding,
                        job_embedding,
                    ),
                )
                for candidate, candidate_embedding in zip(
                    candidates, candidate_embeddings, strict=True
                )
            ),
            key=lambda item: item.similarity_score,
            reverse=True,
        )

        shortlist_limit = min(self.shortlist_size, len(ranked_candidates))
        return RetrievalResult(
            job=job,
            shortlisted_candidates=ranked_candidates[:shortlist_limit],
            provider_name=self.provider_name,
            model_name=self.model_name,
            shortlist_size_limit=self.shortlist_size,
            embedding_provider=self._embedding_provider,
        )


def assemble_candidate_text(candidate: CandidateInput) -> str:
    """Create a consistent retrieval text view for a prepared candidate record."""

    salary = candidate.salary_expectation
    sections = [
        f"Skills: {', '.join(candidate.skills)}",
        f"Experience: {candidate.years_of_experience:.1f} years",
        (
            "Salary expectation: "
            f"{salary.currency} {salary.min_amount:.2f}-{salary.max_amount:.2f}"
        ),
        f"Resume summary: {candidate.extracted_text}",
    ]

    if candidate.video_transcript:
        sections.append(f"Video transcript: {candidate.video_transcript}")

    if candidate.portfolio_url:
        sections.append(f"Portfolio URL: {candidate.portfolio_url}")

    if candidate.portfolio_projects:
        project_summaries = []
        for project in candidate.portfolio_projects:
            technologies = ", ".join(project.technologies) or "None"
            project_summaries.append(
                (
                    f"{project.title}. {project.description}. "
                    f"Technologies: {technologies}"
                )
            )
        sections.append("Portfolio: " + " | ".join(project_summaries))

    return "\n".join(sections)


def assemble_job_text(job: JobInput) -> str:
    """Create a consistent retrieval text view for a prepared job record."""

    salary = job.salary_offered
    nice_to_have = ", ".join(job.nice_to_have_skills) or "None"
    portfolio_requirement = "required" if job.portfolio_required else "not required"

    sections = [
        f"Required skills: {', '.join(job.required_skills)}",
        f"Nice to have skills: {nice_to_have}",
        (
            "Experience range: "
            f"{job.experience_range.min_years:.1f}-{job.experience_range.max_years:.1f} years"
        ),
        f"Salary offered: {salary.currency} {salary.min_amount:.2f}-{salary.max_amount:.2f}",
        f"Portfolio: {portfolio_requirement}",
        f"Job description: {job.job_description_text}",
    ]
    return "\n".join(sections)


def cosine_similarity(left: EmbeddingVector, right: EmbeddingVector) -> float:
    """Compute cosine similarity for two same-length embedding vectors."""

    if len(left) != len(right):
        raise ValueError("Embedding vectors must have the same dimensionality.")
    if not left:
        raise ValueError("Embedding vectors must not be empty.")

    left_norm = sqrt(sum(value * value for value in left))
    right_norm = sqrt(sum(value * value for value in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0

    dot_product = sum(left_value * right_value for left_value, right_value in zip(left, right))
    return dot_product / (left_norm * right_norm)
