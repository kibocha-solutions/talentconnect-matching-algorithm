from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

import numpy as np
import xgboost as xgb

from app.features.extractor import CandidateJobFeatures
from app.ranking.trainer import TrainedRankingModel, XGBoostRankingTrainer
from app.schemas import MatchResult, ScoreBreakdown


@dataclass(frozen=True, slots=True)
class RankedFeatureRow:
    """Ranking output paired with the source feature row for pipeline use."""

    features: CandidateJobFeatures
    match_result: MatchResult
    raw_prediction: float


class XGBoostMatchRanker:
    """Inference-only ranker for candidate-job feature rows."""

    def __init__(
        self,
        trained_model: TrainedRankingModel | None = None,
        *,
        model_dir: Path | None = None,
    ) -> None:
        self._trainer = XGBoostRankingTrainer(model_dir=model_dir)
        self._trained_model = trained_model or self._trainer.load()
        self._expected_feature_names = list(CandidateJobFeatures.feature_names)
        self._validate_model_feature_names(self._trained_model.feature_names)

    @property
    def feature_names(self) -> list[str]:
        return list(self._trained_model.feature_names)

    def rank_one(self, features: CandidateJobFeatures) -> RankedFeatureRow:
        ranked_rows = self.rank_many([features])
        return ranked_rows[0]

    def rank_many(self, feature_rows: list[CandidateJobFeatures]) -> list[RankedFeatureRow]:
        if not feature_rows:
            return []

        matrix = np.asarray(
            [self._ordered_feature_vector(features) for features in feature_rows],
            dtype=np.float32,
        )
        dmatrix = xgb.DMatrix(matrix, feature_names=self.feature_names)
        predictions = self._trained_model.booster.predict(dmatrix)

        ranked_rows = [
            RankedFeatureRow(
                features=features,
                match_result=self._build_match_result(features, float(raw_prediction)),
                raw_prediction=float(raw_prediction),
            )
            for features, raw_prediction in zip(
                feature_rows, predictions, strict=True
            )
        ]
        return sorted(
            ranked_rows,
            key=lambda row: (
                row.match_result.overall_score,
                row.features.phase1_similarity_score,
                row.features.candidate_id,
            ),
            reverse=True,
        )

    def _ordered_feature_vector(self, features: CandidateJobFeatures) -> list[float]:
        current_feature_names = list(CandidateJobFeatures.feature_names)
        if current_feature_names != self.feature_names:
            raise ValueError(
                "Incoming feature contract does not match saved model metadata. "
                f"Expected {self.feature_names}, got {current_feature_names}."
            )
        return features.to_vector()

    def _validate_model_feature_names(self, feature_names: list[str]) -> None:
        if feature_names != self._expected_feature_names:
            raise ValueError(
                "Saved model metadata does not match CandidateJobFeatures. "
                f"Expected {self._expected_feature_names}, got {feature_names}."
            )

    def _build_match_result(
        self,
        features: CandidateJobFeatures,
        raw_prediction: float,
    ) -> MatchResult:
        overall_score = normalize_prediction_to_score(raw_prediction)
        return MatchResult(
            candidate_id=UUID(features.candidate_id),
            job_id=UUID(features.job_id),
            overall_score=overall_score,
            score_breakdown=build_score_breakdown(features),
        )


def build_match_ranker(
    trained_model: TrainedRankingModel | None = None,
    *,
    model_dir: Path | None = None,
) -> XGBoostMatchRanker:
    """Create the default ranker from saved local artifacts."""

    return XGBoostMatchRanker(trained_model=trained_model, model_dir=model_dir)


def normalize_prediction_to_score(raw_prediction: float) -> float:
    """Map the trainer's normalized regression output into the 0-100 UI range."""

    clipped_prediction = min(1.0, max(0.0, raw_prediction))
    return round(clipped_prediction * 100.0, 2)


def build_score_breakdown(features: CandidateJobFeatures) -> ScoreBreakdown:
    """Map stable feature signals into the required score breakdown fields."""

    weighted_skill_score = (
        (features.required_skill_similarity * 0.7)
        + (features.nice_to_have_skill_similarity * 0.3)
    ) * 100.0
    return ScoreBreakdown(
        skills_score=round(min(100.0, max(0.0, weighted_skill_score)), 2),
        experience_score=round(
            min(100.0, max(0.0, features.experience_alignment_score * 100.0)),
            2,
        ),
        salary_score=round(
            min(100.0, max(0.0, features.salary_overlap_score * 100.0)),
            2,
        ),
        portfolio_score=int(features.portfolio_score),
    )
