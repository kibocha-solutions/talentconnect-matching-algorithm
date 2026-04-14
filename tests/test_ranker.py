from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4

from app.features.extractor import CandidateJobFeatures
from app.ranking.ranker import (
    XGBoostMatchRanker,
    build_score_breakdown,
    normalize_prediction_to_score,
)
from app.ranking.trainer import XGBoostRankingTrainer, build_training_examples


def build_features(
    *,
    required_skill_similarity: float,
    nice_to_have_skill_similarity: float,
    experience_gap_years: float,
    experience_alignment_score: float,
    salary_overlap_score: float,
    portfolio_score: float,
    phase1_similarity_score: float,
) -> CandidateJobFeatures:
    return CandidateJobFeatures(
        candidate_id=str(uuid4()),
        job_id=str(uuid4()),
        required_skill_similarity=required_skill_similarity,
        nice_to_have_skill_similarity=nice_to_have_skill_similarity,
        experience_gap_years=experience_gap_years,
        experience_alignment_score=experience_alignment_score,
        salary_overlap_score=salary_overlap_score,
        portfolio_score=portfolio_score,
        phase1_similarity_score=phase1_similarity_score,
    )


def train_ranker(tmp_path: Path) -> XGBoostMatchRanker:
    trainer = XGBoostRankingTrainer(model_dir=tmp_path / "models", num_boost_round=12)
    examples = build_training_examples(
        [
        {
            "candidate_id": str(uuid4()),
            "job_id": str(uuid4()),
            "required_skill_similarity": 0.95,
            "nice_to_have_skill_similarity": 0.82,
            "experience_gap_years": 2.0,
            "experience_alignment_score": 1.0,
            "salary_overlap_score": 0.92,
            "portfolio_score": 100.0,
            "phase1_similarity_score": 0.9,
            "label": 1.0,
        },
        {
            "candidate_id": str(uuid4()),
            "job_id": str(uuid4()),
            "required_skill_similarity": 0.72,
            "nice_to_have_skill_similarity": 0.5,
            "experience_gap_years": 0.5,
            "experience_alignment_score": 1.0,
            "salary_overlap_score": 0.65,
            "portfolio_score": 30.0,
            "phase1_similarity_score": 0.68,
            "label": 0.7,
        },
        {
            "candidate_id": str(uuid4()),
            "job_id": str(uuid4()),
            "required_skill_similarity": 0.25,
            "nice_to_have_skill_similarity": 0.1,
            "experience_gap_years": -2.0,
            "experience_alignment_score": 0.3,
            "salary_overlap_score": 0.2,
            "portfolio_score": 0.0,
            "phase1_similarity_score": 0.28,
            "label": 0.0,
        },
        ]
    )
    trained_model = trainer.fit_and_save(examples)
    return XGBoostMatchRanker(trained_model=trained_model, model_dir=tmp_path / "models")


def test_ranker_scores_one_row_into_match_result_range(tmp_path: Path) -> None:
    ranker = train_ranker(tmp_path)
    features = build_features(
        required_skill_similarity=0.9,
        nice_to_have_skill_similarity=0.7,
        experience_gap_years=1.0,
        experience_alignment_score=1.0,
        salary_overlap_score=0.8,
        portfolio_score=100.0,
        phase1_similarity_score=0.85,
    )

    ranked_row = ranker.rank_one(features)

    assert 0.0 <= ranked_row.match_result.overall_score <= 100.0
    assert ranked_row.match_result.score_breakdown.skills_score >= 0.0
    assert ranked_row.match_result.score_breakdown.experience_score >= 0.0
    assert ranked_row.match_result.score_breakdown.salary_score >= 0.0
    assert ranked_row.match_result.score_breakdown.portfolio_score == 100


def test_ranker_orders_rows_by_descending_overall_score(tmp_path: Path) -> None:
    ranker = train_ranker(tmp_path)
    stronger = build_features(
        required_skill_similarity=0.95,
        nice_to_have_skill_similarity=0.8,
        experience_gap_years=1.5,
        experience_alignment_score=1.0,
        salary_overlap_score=0.9,
        portfolio_score=100.0,
        phase1_similarity_score=0.91,
    )
    weaker = build_features(
        required_skill_similarity=0.3,
        nice_to_have_skill_similarity=0.2,
        experience_gap_years=-1.5,
        experience_alignment_score=0.35,
        salary_overlap_score=0.25,
        portfolio_score=0.0,
        phase1_similarity_score=0.3,
    )

    ranked_rows = ranker.rank_many([weaker, stronger])

    assert len(ranked_rows) == 2
    assert ranked_rows[0].match_result.overall_score >= ranked_rows[1].match_result.overall_score
    assert ranked_rows[0].features == stronger


def test_ranker_fails_when_saved_metadata_feature_order_is_tampered(tmp_path: Path) -> None:
    trainer = XGBoostRankingTrainer(model_dir=tmp_path / "models", num_boost_round=6)
    examples = build_training_examples(
        [
            {
                "candidate_id": str(uuid4()),
                "job_id": str(uuid4()),
                "required_skill_similarity": 0.8,
                "nice_to_have_skill_similarity": 0.6,
                "experience_gap_years": 1.0,
                "experience_alignment_score": 1.0,
                "salary_overlap_score": 0.8,
                "portfolio_score": 100.0,
                "phase1_similarity_score": 0.82,
                "label": 1.0,
            }
        ]
    )
    trainer.fit_and_save(examples)

    metadata_path = tmp_path / "models" / "xgboost-ranker.metadata.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    metadata["feature_names"] = list(reversed(metadata["feature_names"]))
    metadata_path.write_text(json.dumps(metadata), encoding="utf-8")

    try:
        XGBoostMatchRanker(model_dir=tmp_path / "models")
    except ValueError as error:
        assert "Saved model metadata does not match" in str(error)
    else:
        raise AssertionError("Expected ranker initialization to fail.")


def test_score_helpers_are_honest_and_stable() -> None:
    assert normalize_prediction_to_score(-0.5) == 0.0
    assert normalize_prediction_to_score(0.7349) == 73.49
    assert normalize_prediction_to_score(2.0) == 100.0

    breakdown = build_score_breakdown(
        build_features(
            required_skill_similarity=0.8,
            nice_to_have_skill_similarity=0.4,
            experience_gap_years=1.0,
            experience_alignment_score=0.75,
            salary_overlap_score=0.6,
            portfolio_score=30.0,
            phase1_similarity_score=0.7,
        )
    )
    assert breakdown.skills_score == 68.0
    assert breakdown.experience_score == 75.0
    assert breakdown.salary_score == 60.0
    assert breakdown.portfolio_score == 30
