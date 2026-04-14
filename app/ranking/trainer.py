from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import xgboost as xgb

from app.config import get_settings
from app.features.extractor import CandidateJobFeatures


@dataclass(frozen=True, slots=True)
class LabeledFeatureExample:
    """One supervised training row for a candidate-job pair."""

    features: CandidateJobFeatures
    label: float
    candidate_id: str | None = None
    job_id: str | None = None


@dataclass(frozen=True, slots=True)
class TrainingDataset:
    """Deterministic matrix-ready representation of labeled examples."""

    feature_names: list[str]
    feature_matrix: np.ndarray
    label_vector: np.ndarray
    candidate_ids: list[str]
    job_ids: list[str]


@dataclass(frozen=True, slots=True)
class TrainingSummary:
    """Small sanity snapshot from one training run."""

    row_count: int
    feature_count: int
    label_min: float
    label_max: float
    training_rmse: float


@dataclass(frozen=True, slots=True)
class TrainedRankingModel:
    """Loaded model and metadata needed for inference compatibility."""

    booster: xgb.Booster
    feature_names: list[str]
    model_path: Path
    metadata_path: Path
    random_seed: int
    training_summary: TrainingSummary


class XGBoostRankingTrainer:
    """Train and persist the first-pass ranking scorer from feature vectors."""

    def __init__(
        self,
        *,
        random_seed: int | None = None,
        model_dir: Path | None = None,
        model_filename: str = "xgboost-ranker.json",
        metadata_filename: str = "xgboost-ranker.metadata.json",
        num_boost_round: int = 48,
        params: dict[str, float | int | str] | None = None,
    ) -> None:
        settings = get_settings()
        self._random_seed = (
            settings.xgboost_random_seed if random_seed is None else random_seed
        )
        self._model_dir = (
            settings.resolved_model_dir if model_dir is None else model_dir.resolve()
        )
        self._model_filename = model_filename
        self._metadata_filename = metadata_filename
        self._num_boost_round = num_boost_round
        self._params = self._build_params(params)

    @property
    def model_path(self) -> Path:
        return self._model_dir / self._model_filename

    @property
    def metadata_path(self) -> Path:
        return self._model_dir / self._metadata_filename

    @property
    def random_seed(self) -> int:
        return self._random_seed

    def prepare_dataset(
        self,
        examples: list[LabeledFeatureExample],
    ) -> TrainingDataset:
        if not examples:
            raise ValueError("examples must contain at least one labeled feature row.")

        expected_feature_names = list(CandidateJobFeatures.feature_names)
        feature_rows: list[list[float]] = []
        label_values: list[float] = []
        candidate_ids: list[str] = []
        job_ids: list[str] = []

        for example in examples:
            feature_vector = example.features.to_vector()
            if len(feature_vector) != len(expected_feature_names):
                raise ValueError("Feature vector length does not match trainer schema.")
            if not 0.0 <= example.label <= 1.0:
                raise ValueError("label must be normalized into the range [0.0, 1.0].")

            feature_rows.append(feature_vector)
            label_values.append(float(example.label))
            candidate_ids.append(example.candidate_id or example.features.candidate_id)
            job_ids.append(example.job_id or example.features.job_id)

        return TrainingDataset(
            feature_names=expected_feature_names,
            feature_matrix=np.asarray(feature_rows, dtype=np.float32),
            label_vector=np.asarray(label_values, dtype=np.float32),
            candidate_ids=candidate_ids,
            job_ids=job_ids,
        )

    def train(
        self,
        examples: list[LabeledFeatureExample],
    ) -> TrainedRankingModel:
        dataset = self.prepare_dataset(examples)
        training_matrix = xgb.DMatrix(
            dataset.feature_matrix,
            label=dataset.label_vector,
            feature_names=dataset.feature_names,
        )
        booster = xgb.train(
            params=self._params,
            dtrain=training_matrix,
            num_boost_round=self._num_boost_round,
        )

        predictions = booster.predict(training_matrix)
        rmse = float(
            np.sqrt(np.mean(np.square(predictions - dataset.label_vector), dtype=np.float64))
        )
        summary = TrainingSummary(
            row_count=int(dataset.feature_matrix.shape[0]),
            feature_count=int(dataset.feature_matrix.shape[1]),
            label_min=float(np.min(dataset.label_vector)),
            label_max=float(np.max(dataset.label_vector)),
            training_rmse=rmse,
        )

        return TrainedRankingModel(
            booster=booster,
            feature_names=dataset.feature_names,
            model_path=self.model_path,
            metadata_path=self.metadata_path,
            random_seed=self._random_seed,
            training_summary=summary,
        )

    def fit_and_save(
        self,
        examples: list[LabeledFeatureExample],
    ) -> TrainedRankingModel:
        trained_model = self.train(examples)
        self.save(trained_model)
        return trained_model

    def save(self, trained_model: TrainedRankingModel) -> None:
        trained_model.model_path.parent.mkdir(parents=True, exist_ok=True)
        trained_model.booster.save_model(trained_model.model_path)

        metadata = {
            "feature_names": trained_model.feature_names,
            "random_seed": trained_model.random_seed,
            "model_format": "xgboost_booster_json",
            "training_summary": asdict(trained_model.training_summary),
        }
        trained_model.metadata_path.write_text(
            json.dumps(metadata, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    def load(self) -> TrainedRankingModel:
        if not self.model_path.exists():
            raise FileNotFoundError(f"Model artifact not found: {self.model_path}")
        if not self.metadata_path.exists():
            raise FileNotFoundError(f"Metadata artifact not found: {self.metadata_path}")

        metadata = json.loads(self.metadata_path.read_text(encoding="utf-8"))
        feature_names = metadata["feature_names"]
        booster = xgb.Booster()
        booster.load_model(self.model_path)

        training_summary = TrainingSummary(**metadata["training_summary"])
        return TrainedRankingModel(
            booster=booster,
            feature_names=feature_names,
            model_path=self.model_path,
            metadata_path=self.metadata_path,
            random_seed=int(metadata["random_seed"]),
            training_summary=training_summary,
        )

    def _build_params(
        self,
        overrides: dict[str, float | int | str] | None,
    ) -> dict[str, float | int | str]:
        params: dict[str, float | int | str] = {
            "objective": "reg:squarederror",
            "eval_metric": "rmse",
            "eta": 0.1,
            "max_depth": 4,
            "min_child_weight": 1,
            "subsample": 1.0,
            "colsample_bytree": 1.0,
            "seed": self._random_seed,
        }
        if overrides:
            params.update(overrides)
        return params


def build_training_examples(
    rows: list[dict[str, object]],
) -> list[LabeledFeatureExample]:
    """Convert simple row dictionaries into labeled training examples."""

    examples: list[LabeledFeatureExample] = []
    expected_feature_names = list(CandidateJobFeatures.feature_names)

    for row in rows:
        missing_feature_names = [
            name for name in expected_feature_names if name not in row
        ]
        if missing_feature_names:
            raise ValueError(
                "Training row is missing required feature fields: "
                + ", ".join(missing_feature_names)
            )
        if "label" not in row:
            raise ValueError("Training row must include a normalized label field.")

        features = CandidateJobFeatures(
            candidate_id=str(row.get("candidate_id", "")),
            job_id=str(row.get("job_id", "")),
            required_skill_similarity=float(row["required_skill_similarity"]),
            nice_to_have_skill_similarity=float(row["nice_to_have_skill_similarity"]),
            experience_gap_years=float(row["experience_gap_years"]),
            experience_alignment_score=float(row["experience_alignment_score"]),
            salary_overlap_score=float(row["salary_overlap_score"]),
            portfolio_score=float(row["portfolio_score"]),
            phase1_similarity_score=float(row["phase1_similarity_score"]),
        )
        examples.append(
            LabeledFeatureExample(
                features=features,
                label=float(row["label"]),
                candidate_id=features.candidate_id or None,
                job_id=features.job_id or None,
            )
        )

    return examples
