from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from pydantic import TypeAdapter

from app.features.extractor import CandidateJobFeatureExtractor, CandidateJobFeatures
from app.ranking.ranker import RankedFeatureRow, XGBoostMatchRanker
from app.retrieval.retriever import (
    InMemorySemanticRetriever,
    RetrievalResult,
    assemble_candidate_text,
    assemble_job_text,
)
from app.schemas import CandidateInput, JobInput, MatchResult


@dataclass(frozen=True, slots=True)
class MatchingPipelineResult:
    """Ordered end-to-end matching output with useful intermediate state."""

    job: JobInput
    validated_candidates: list[CandidateInput]
    retrieval_result: RetrievalResult
    feature_rows: list[CandidateJobFeatures]
    ranked_rows: list[RankedFeatureRow]

    @property
    def match_results(self) -> list[MatchResult]:
        return [ranked_row.match_result for ranked_row in self.ranked_rows]


class TalentConnectMatchingPipeline:
    """Orchestrate validation, retrieval, feature extraction, and ranking."""

    def __init__(
        self,
        *,
        retriever: InMemorySemanticRetriever | None = None,
        feature_extractor: CandidateJobFeatureExtractor | None = None,
        ranker: XGBoostMatchRanker | None = None,
    ) -> None:
        self._retriever = retriever or InMemorySemanticRetriever()
        self._feature_extractor = feature_extractor or CandidateJobFeatureExtractor()
        self._ranker = ranker or XGBoostMatchRanker()
        self._candidate_list_adapter = TypeAdapter(list[CandidateInput])
        self._candidate_adapter = TypeAdapter(CandidateInput)
        self._job_adapter = TypeAdapter(JobInput)

    def run(
        self,
        candidates: list[CandidateInput | dict[str, Any]],
        job: JobInput | dict[str, Any],
    ) -> MatchingPipelineResult:
        validated_candidates = self._validate_candidates(candidates)
        validated_job = self._validate_job(job)

        retrieval_result = self._retriever.shortlist(validated_candidates, validated_job)
        feature_rows = [
            self._feature_extractor.extract_from_retrieval_candidate(
                retrieval_candidate,
                validated_job,
            )
            for retrieval_candidate in retrieval_result.shortlisted_candidates
        ]
        ranked_rows = self._ranker.rank_many(feature_rows)

        return MatchingPipelineResult(
            job=validated_job,
            validated_candidates=validated_candidates,
            retrieval_result=retrieval_result,
            feature_rows=feature_rows,
            ranked_rows=ranked_rows,
        )

    def validate_candidate(self, candidate: CandidateInput | dict[str, Any]) -> CandidateInput:
        return self._candidate_adapter.validate_python(candidate)

    def validate_job(self, job: JobInput | dict[str, Any]) -> JobInput:
        return self._job_adapter.validate_python(job)

    def preview_candidate_text(
        self,
        candidate: CandidateInput | dict[str, Any],
    ) -> str:
        return assemble_candidate_text(self.validate_candidate(candidate))

    def preview_job_text(self, job: JobInput | dict[str, Any]) -> str:
        return assemble_job_text(self.validate_job(job))

    def _validate_candidates(
        self,
        candidates: list[CandidateInput | dict[str, Any]],
    ) -> list[CandidateInput]:
        return self._candidate_list_adapter.validate_python(candidates)

    def _validate_job(self, job: JobInput | dict[str, Any]) -> JobInput:
        return self.validate_job(job)


def build_matching_pipeline(
    *,
    retriever: InMemorySemanticRetriever | None = None,
    feature_extractor: CandidateJobFeatureExtractor | None = None,
    ranker: XGBoostMatchRanker | None = None,
) -> TalentConnectMatchingPipeline:
    """Create the default callable matching flow for scripts and API handlers."""

    return TalentConnectMatchingPipeline(
        retriever=retriever,
        feature_extractor=feature_extractor,
        ranker=ranker,
    )
