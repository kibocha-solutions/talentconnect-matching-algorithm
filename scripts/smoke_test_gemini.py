#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.config import get_settings
from app.embeddings.gemini_provider import GeminiEmbeddingProvider


def main() -> int:
    try:
        settings = get_settings()

        if settings.embedding_provider != "gemini":
            raise ValueError(
                "EMBEDDING_PROVIDER must be set to 'gemini' for this smoke test."
            )

        provider = GeminiEmbeddingProvider()
        single_embedding = provider.embed_text("Talent matching smoke test.")
        batch_embeddings = provider.embed_texts(
            [
                "Short candidate profile.",
                "Short job requirement.",
            ]
        )

        if len(batch_embeddings) < 2:
            raise RuntimeError("Batch embedding returned fewer vectors than requested.")

        print("Gemini embedding smoke test passed")
        print(f"provider: {provider.provider_name}")
        print(f"model: {provider.model_name}")
        print(f"single embedding length: {len(single_embedding)}")
        print(f"batch size: {len(batch_embeddings)}")
        print(f"first batch embedding length: {len(batch_embeddings[0])}")
        return 0
    except Exception as exc:
        print(f"Gemini embedding smoke test failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
