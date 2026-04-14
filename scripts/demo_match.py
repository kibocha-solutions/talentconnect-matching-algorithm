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

DEFAULT_DEMO_DATA_PATH = PROJECT_ROOT / "data" / "samples" / "demo_match.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a local end-to-end TalentConnect matching demo.",
    )
    parser.add_argument(
        "--demo-data",
        type=Path,
        default=DEFAULT_DEMO_DATA_PATH,
        help="Path to the demo candidate/job JSON file.",
    )
    parser.add_argument(
        "--shortlist-size",
        type=int,
        default=3,
        help="Shortlist size to use for the demo retrieval step.",
    )
    parser.add_argument(
        "--model-dir",
        type=Path,
        default=None,
        help="Optional directory override for saved model artifacts.",
    )
    return parser.parse_args()


def load_demo_data(path: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"Demo data file not found: {path}")

    payload = json.loads(path.read_text(encoding="utf-8"))
    candidates = payload.get("candidates")
    job = payload.get("job")

    if not isinstance(candidates, list) or not candidates:
        raise ValueError("Demo data must include a non-empty 'candidates' list.")
    if not isinstance(job, dict):
        raise ValueError("Demo data must include a valid 'job' object.")
    return candidates, job


def main() -> int:
    try:
        args = parse_args()
        candidates, job = load_demo_data(args.demo_data.resolve())

        embedding_provider = LocalEmbeddingProvider()
        retriever = InMemorySemanticRetriever(
            embedding_provider=embedding_provider,
            shortlist_size=args.shortlist_size,
        )
        extractor = CandidateJobFeatureExtractor(embedding_provider=embedding_provider)
        ranker = XGBoostMatchRanker(
            model_dir=args.model_dir.resolve() if args.model_dir else None,
        )
        pipeline = build_matching_pipeline(
            retriever=retriever,
            feature_extractor=extractor,
            ranker=ranker,
        )
        result = pipeline.run(candidates, job)

        print("Demo match completed")
        print(f"retrieval provider: {result.retrieval_result.provider_name}")
        print(f"retrieval model: {result.retrieval_result.model_name}")
        print(f"shortlisted candidates: {len(result.retrieval_result.shortlisted_candidates)}")
        print()
        for index, ranked_row in enumerate(result.ranked_rows, start=1):
            match = ranked_row.match_result
            breakdown = match.score_breakdown
            print(
                f"{index}. candidate={match.candidate_id} "
                f"overall={match.overall_score:.2f}"
            )
            print(
                "   breakdown: "
                f"skills={breakdown.skills_score:.2f}, "
                f"experience={breakdown.experience_score:.2f}, "
                f"salary={breakdown.salary_score:.2f}, "
                f"portfolio={breakdown.portfolio_score}"
            )
        return 0
    except Exception as exc:
        print(f"Demo match failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
