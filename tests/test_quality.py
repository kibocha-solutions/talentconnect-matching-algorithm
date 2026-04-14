from __future__ import annotations

import json
from pathlib import Path

from app.embeddings.local_provider import LocalEmbeddingProvider
from app.features.extractor import CandidateJobFeatureExtractor
from app.pipeline import build_matching_pipeline
from app.ranking.ranker import XGBoostMatchRanker
from app.retrieval.retriever import InMemorySemanticRetriever


def test_quality_fixture_top_candidate_matches_human_expectation() -> None:
    fixture_path = Path("data/samples/evaluation_cases.json")
    payload = json.loads(fixture_path.read_text(encoding="utf-8"))

    embedding_provider = LocalEmbeddingProvider()
    pipeline = build_matching_pipeline(
        retriever=InMemorySemanticRetriever(
            embedding_provider=embedding_provider,
            shortlist_size=5,
        ),
        feature_extractor=CandidateJobFeatureExtractor(
            embedding_provider=embedding_provider
        ),
        ranker=XGBoostMatchRanker(),
    )

    results_by_label: dict[str, str] = {}
    for job_case in payload["jobs"]:
        result = pipeline.run(payload["candidate_pool"], job_case["job"])
        results_by_label[job_case["label"]] = result.ranked_rows[0].features.candidate_id

    assert (
        results_by_label["backend-api"]
        == "11111111-1111-4111-8111-111111111111"
    )
    assert (
        results_by_label["frontend-product"]
        == "33333333-3333-4333-8333-333333333333"
    )
    assert (
        results_by_label["ml-engineer"]
        == "55555555-5555-4555-8555-555555555555"
    )
