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

from app.embeddings.factory import build_embedding_provider, resolve_provider_metadata
from app.features.extractor import CandidateJobFeatureExtractor
from app.pipeline import build_matching_pipeline
from app.ranking.ranker import XGBoostMatchRanker
from app.retrieval.retriever import InMemorySemanticRetriever

DEFAULT_DATASET_PATH = (
    PROJECT_ROOT / "data" / "samples" / "external_evaluation_dataset.json"
)
DEFAULT_MANUAL_REVIEW_PATH = (
    PROJECT_ROOT / "data" / "samples" / "external_evaluation_manual_review.json"
)
DEFAULT_OUTPUT_PATH = (
    PROJECT_ROOT / "data" / "samples" / "external_evaluation_results.json"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compare manual review expectations to current ranking output.",
    )
    parser.add_argument(
        "--dataset",
        type=Path,
        default=DEFAULT_DATASET_PATH,
        help="Path to the external evaluation dataset JSON file.",
    )
    parser.add_argument(
        "--manual-review",
        type=Path,
        default=DEFAULT_MANUAL_REVIEW_PATH,
        help="Path to the manual review JSON file.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_PATH,
        help="Path to the generated evaluation results JSON file.",
    )
    parser.add_argument(
        "--shortlist-size",
        type=int,
        default=20,
        help="Shortlist size to use during evaluation. Set to candidate pool size for full ordering.",
    )
    return parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"File not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def build_alias_map(manual_review: dict[str, Any]) -> dict[str, str]:
    return {
        entry["candidate_id"]: entry["alias"]
        for entry in manual_review["candidate_catalog"]
    }


def build_manual_job_map(manual_review: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        job_review["label"]: job_review
        for job_review in manual_review["jobs"]
    }


def summarize_ranked_row(
    ranked_row: Any,
    alias_map: dict[str, str],
    position: int,
) -> dict[str, Any]:
    candidate_id = ranked_row.features.candidate_id
    breakdown = ranked_row.match_result.score_breakdown
    return {
        "rank": position,
        "candidate_id": candidate_id,
        "alias": alias_map.get(candidate_id, candidate_id),
        "overall_score": ranked_row.match_result.overall_score,
        "phase1_similarity_score": ranked_row.features.phase1_similarity_score,
        "skills_score": breakdown.skills_score,
        "experience_score": breakdown.experience_score,
        "salary_score": breakdown.salary_score,
        "portfolio_score": breakdown.portfolio_score,
    }


def build_pipeline(shortlist_size: int):
    embedding_provider = build_embedding_provider()
    pipeline = build_matching_pipeline(
        retriever=InMemorySemanticRetriever(
            embedding_provider=embedding_provider,
            shortlist_size=shortlist_size,
        ),
        feature_extractor=CandidateJobFeatureExtractor(
            embedding_provider=embedding_provider
        ),
        ranker=XGBoostMatchRanker(),
    )
    return pipeline, embedding_provider


def main() -> int:
    try:
        args = parse_args()
        dataset = load_json(args.dataset.resolve())
        manual_review = load_json(args.manual_review.resolve())

        candidate_pool = dataset["candidate_pool"]
        if args.shortlist_size < len(candidate_pool):
            print(
                "Warning: shortlist size is smaller than candidate pool size. "
                "Some candidates will not be ranked.",
                file=sys.stderr,
            )

        alias_map = build_alias_map(manual_review)
        manual_job_map = build_manual_job_map(manual_review)
        pipeline, embedding_provider = build_pipeline(shortlist_size=args.shortlist_size)

        job_results: list[dict[str, Any]] = []
        top_1_matches = 0
        top_3_contains_expected_top = 0
        average_expected_top_rank = 0.0

        for job_case in dataset["jobs"]:
            label = job_case["label"]
            manual_case = manual_job_map[label]
            result = pipeline.run(candidate_pool, job_case["job"])

            ranked_rows = [
                summarize_ranked_row(ranked_row, alias_map, index)
                for index, ranked_row in enumerate(result.ranked_rows, start=1)
            ]
            expected_top = manual_case["expected_top_candidate_id"]
            actual_top = ranked_rows[0]["candidate_id"]
            rank_index = next(
                index
                for index, row in enumerate(ranked_rows, start=1)
                if row["candidate_id"] == expected_top
            )
            actual_top_3_ids = [row["candidate_id"] for row in ranked_rows[:3]]
            low_fit_positions = {
                candidate_id: next(
                    index
                    for index, row in enumerate(ranked_rows, start=1)
                    if row["candidate_id"] == candidate_id
                )
                for candidate_id in manual_case["obvious_low_fit_candidate_ids"]
            }

            top_1_match = actual_top == expected_top
            contains_expected_top_in_top_3 = expected_top in actual_top_3_ids

            top_1_matches += int(top_1_match)
            top_3_contains_expected_top += int(contains_expected_top_in_top_3)
            average_expected_top_rank += rank_index

            job_results.append(
                {
                    "label": label,
                    "source_label": job_case["source_label"],
                    "manual_expectation": {
                        "expected_top_candidate_id": expected_top,
                        "expected_top_alias": alias_map.get(expected_top, expected_top),
                        "expected_top_3_candidate_ids": manual_case[
                            "expected_top_3_candidate_ids"
                        ],
                        "expected_top_3_aliases": [
                            alias_map.get(candidate_id, candidate_id)
                            for candidate_id in manual_case["expected_top_3_candidate_ids"]
                        ],
                        "obvious_low_fit_candidate_ids": manual_case[
                            "obvious_low_fit_candidate_ids"
                        ],
                        "obvious_low_fit_aliases": [
                            alias_map.get(candidate_id, candidate_id)
                            for candidate_id in manual_case["obvious_low_fit_candidate_ids"]
                        ],
                        "notes": manual_case["notes"],
                    },
                    "comparison": {
                        "top_1_match": top_1_match,
                        "expected_top_rank": rank_index,
                        "expected_top_found_in_top_3": contains_expected_top_in_top_3,
                        "top_3_overlap_count": len(
                            set(actual_top_3_ids)
                            & set(manual_case["expected_top_3_candidate_ids"])
                        ),
                        "low_fit_positions": low_fit_positions,
                    },
                    "actual_top_10": ranked_rows[:10],
                    "actual_full_ranking": ranked_rows,
                }
            )

        provider_metadata = resolve_provider_metadata(embedding_provider)
        results_payload = {
            "dataset_label": dataset["dataset_label"],
            "candidate_pool_size": len(candidate_pool),
            "jobs_evaluated": len(dataset["jobs"]),
            "embedding_provider": {
                "requested_provider": provider_metadata.requested_provider,
                "active_provider": provider_metadata.active_provider,
                "model_name": provider_metadata.model_name,
                "fallback_triggered": provider_metadata.fallback_triggered,
                "fallback_reason": provider_metadata.fallback_reason,
            },
            "summary": {
                "top_1_matches": top_1_matches,
                "jobs_with_expected_top_in_top_3": top_3_contains_expected_top,
                "average_expected_top_rank": round(
                    average_expected_top_rank / len(dataset["jobs"]),
                    2,
                ),
            },
            "job_results": job_results,
        }

        args.output.write_text(
            json.dumps(results_payload, indent=2, sort_keys=False) + "\n",
            encoding="utf-8",
        )

        print(f"candidate pool size: {len(candidate_pool)}")
        print(f"jobs evaluated: {len(dataset['jobs'])}")
        print(
            "embedding provider: "
            f"requested={provider_metadata.requested_provider} "
            f"active={provider_metadata.active_provider}"
        )
        print(f"embedding model: {provider_metadata.model_name}")
        if provider_metadata.fallback_triggered:
            print(f"fallback: yes - {provider_metadata.fallback_reason}")
        else:
            print("fallback: no")
        print(
            f"top-1 matches: {top_1_matches}/{len(dataset['jobs'])}"
        )
        print(
            "jobs with expected top in top 3: "
            f"{top_3_contains_expected_top}/{len(dataset['jobs'])}"
        )
        print(
            "average expected-top rank: "
            f"{results_payload['summary']['average_expected_top_rank']}"
        )
        print()

        for job_result in job_results:
            comparison = job_result["comparison"]
            print(f"job: {job_result['label']}")
            print(
                "manual top: "
                f"{job_result['manual_expectation']['expected_top_alias']}"
            )
            print(f"manual top rank in model output: {comparison['expected_top_rank']}")
            print(f"top-1 match: {comparison['top_1_match']}")
            print(
                "top 3 overlap count: "
                f"{comparison['top_3_overlap_count']}"
            )
            print("actual top 3:")
            for row in job_result["actual_top_10"][:3]:
                print(
                    f"  {row['rank']}. {row['alias']} "
                    f"overall={row['overall_score']:.2f} "
                    f"phase1={row['phase1_similarity_score']:.3f}"
                )
            print()

        return 0
    except Exception as exc:
        print(f"External evaluation failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
