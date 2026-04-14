#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.embeddings.local_provider import LocalEmbeddingProvider
from app.features.extractor import CandidateJobFeatureExtractor
from app.pipeline import build_matching_pipeline
from app.ranking.ranker import XGBoostMatchRanker
from app.retrieval.retriever import InMemorySemanticRetriever

DEFAULT_EVAL_PATH = PROJECT_ROOT / "data" / "samples" / "evaluation_cases.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Evaluate current ranking behavior on a small manual set.",
    )
    parser.add_argument(
        "--evaluation-data",
        type=Path,
        default=DEFAULT_EVAL_PATH,
        help="Path to the evaluation fixture JSON file.",
    )
    parser.add_argument(
        "--shortlist-size",
        type=int,
        default=5,
        help="Shortlist size to use during evaluation.",
    )
    return parser.parse_args()


def load_evaluation_data(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"Evaluation data file not found: {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    if "candidate_pool" not in payload or "jobs" not in payload:
        raise ValueError("Evaluation data must contain 'candidate_pool' and 'jobs'.")
    return payload


def main() -> int:
    try:
        args = parse_args()
        payload = load_evaluation_data(args.evaluation_data.resolve())

        embedding_provider = LocalEmbeddingProvider()
        pipeline = build_matching_pipeline(
            retriever=InMemorySemanticRetriever(
                embedding_provider=embedding_provider,
                shortlist_size=args.shortlist_size,
            ),
            feature_extractor=CandidateJobFeatureExtractor(
                embedding_provider=embedding_provider
            ),
            ranker=XGBoostMatchRanker(),
        )

        candidate_pool = payload["candidate_pool"]
        total_cases = len(candidate_pool) * len(payload["jobs"])
        print(f"candidate-job cases: {total_cases}")
        print(f"candidate pool size: {len(candidate_pool)}")
        print(f"jobs evaluated: {len(payload['jobs'])}")
        print()

        for job_case in payload["jobs"]:
            result = pipeline.run(candidate_pool, job_case["job"])
            top_row = result.ranked_rows[0]
            print(f"job: {job_case['label']}")
            print(f"expected top: {job_case['expected_top_candidate_id']}")
            print(f"actual top:   {top_row.features.candidate_id}")
            print(f"notes: {job_case['notes']}")
            print("top ranked candidates:")
            for index, ranked_row in enumerate(result.ranked_rows[:3], start=1):
                breakdown = ranked_row.match_result.score_breakdown
                print(
                    f"  {index}. {ranked_row.features.candidate_id} "
                    f"overall={ranked_row.match_result.overall_score:.2f} "
                    f"phase1={ranked_row.features.phase1_similarity_score:.3f} "
                    f"skills={breakdown.skills_score:.2f} "
                    f"experience={breakdown.experience_score:.2f} "
                    f"salary={breakdown.salary_score:.2f} "
                    f"portfolio={breakdown.portfolio_score}"
                )
            print()
        return 0
    except Exception as exc:
        print(f"Evaluation failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
