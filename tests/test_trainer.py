from __future__ import annotations

from pathlib import Path

import numpy as np

from app.features.extractor import CandidateJobFeatures
from app.ranking.trainer import (
    LabeledFeatureExample,
    XGBoostRankingTrainer,
    build_training_examples,
)


def build_example(
    *,
    candidate_id: str,
    job_id: str,
    required_skill_similarity: float,
    nice_to_have_skill_similarity: float,
    experience_gap_years: float,
    experience_alignment_score: float,
    salary_overlap_score: float,
    portfolio_score: float,
    phase1_similarity_score: float,
    label: float,
) -> LabeledFeatureExample:
    return LabeledFeatureExample(
        features=CandidateJobFeatures(
            candidate_id=candidate_id,
            job_id=job_id,
            required_skill_similarity=required_skill_similarity,
            nice_to_have_skill_similarity=nice_to_have_skill_similarity,
            experience_gap_years=experience_gap_years,
            experience_alignment_score=experience_alignment_score,
            salary_overlap_score=salary_overlap_score,
            portfolio_score=portfolio_score,
            phase1_similarity_score=phase1_similarity_score,
        ),
        label=label,
    )


def test_trainer_prepares_matrix_in_feature_contract_order() -> None:
    trainer = XGBoostRankingTrainer(model_dir=Path("models/test-trainer-order"))
    examples = [
        build_example(
            candidate_id="candidate-1",
            job_id="job-1",
            required_skill_similarity=0.9,
            nice_to_have_skill_similarity=0.7,
            experience_gap_years=2.0,
            experience_alignment_score=1.0,
            salary_overlap_score=0.8,
            portfolio_score=100.0,
            phase1_similarity_score=0.88,
            label=1.0,
        ),
        build_example(
            candidate_id="candidate-2",
            job_id="job-1",
            required_skill_similarity=0.5,
            nice_to_have_skill_similarity=0.4,
            experience_gap_years=-1.0,
            experience_alignment_score=0.66,
            salary_overlap_score=0.5,
            portfolio_score=30.0,
            phase1_similarity_score=0.61,
            label=0.0,
        ),
    ]

    dataset = trainer.prepare_dataset(examples)

    assert dataset.feature_names == list(CandidateJobFeatures.feature_names)
    assert dataset.feature_matrix.shape == (2, 7)
    assert dataset.label_vector.shape == (2,)
    assert dataset.candidate_ids == ["candidate-1", "candidate-2"]
    assert dataset.job_ids == ["job-1", "job-1"]
    assert np.allclose(
        dataset.feature_matrix[0],
        np.asarray(examples[0].features.to_vector(), dtype=np.float32),
    )


def test_trainer_saves_and_loads_local_model_artifacts(tmp_path: Path) -> None:
    trainer = XGBoostRankingTrainer(
        model_dir=tmp_path / "models",
        num_boost_round=8,
    )
    examples = [
        build_example(
            candidate_id="candidate-1",
            job_id="job-1",
            required_skill_similarity=0.95,
            nice_to_have_skill_similarity=0.85,
            experience_gap_years=1.0,
            experience_alignment_score=1.0,
            salary_overlap_score=0.9,
            portfolio_score=100.0,
            phase1_similarity_score=0.92,
            label=1.0,
        ),
        build_example(
            candidate_id="candidate-2",
            job_id="job-1",
            required_skill_similarity=0.35,
            nice_to_have_skill_similarity=0.25,
            experience_gap_years=-2.0,
            experience_alignment_score=0.33,
            salary_overlap_score=0.2,
            portfolio_score=0.0,
            phase1_similarity_score=0.41,
            label=0.0,
        ),
        build_example(
            candidate_id="candidate-3",
            job_id="job-2",
            required_skill_similarity=0.7,
            nice_to_have_skill_similarity=0.55,
            experience_gap_years=0.5,
            experience_alignment_score=1.0,
            salary_overlap_score=0.65,
            portfolio_score=30.0,
            phase1_similarity_score=0.73,
            label=0.7,
        ),
    ]

    trained_model = trainer.fit_and_save(examples)
    reloaded_model = trainer.load()

    assert trained_model.model_path.exists()
    assert trained_model.metadata_path.exists()
    assert reloaded_model.feature_names == list(CandidateJobFeatures.feature_names)
    assert reloaded_model.training_summary.row_count == 3
    assert reloaded_model.training_summary.feature_count == 7


def test_build_training_examples_accepts_plain_row_dicts() -> None:
    rows = [
        {
            "candidate_id": "candidate-1",
            "job_id": "job-1",
            "required_skill_similarity": 0.82,
            "nice_to_have_skill_similarity": 0.66,
            "experience_gap_years": 1.0,
            "experience_alignment_score": 1.0,
            "salary_overlap_score": 0.75,
            "portfolio_score": 100.0,
            "phase1_similarity_score": 0.8,
            "label": 1.0,
        }
    ]

    examples = build_training_examples(rows)

    assert len(examples) == 1
    assert examples[0].features.candidate_id == "candidate-1"
    assert examples[0].features.job_id == "job-1"
    assert examples[0].label == 1.0
