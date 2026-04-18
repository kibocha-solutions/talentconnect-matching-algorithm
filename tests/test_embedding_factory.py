from __future__ import annotations

from app.config import get_settings
from app.embeddings.base import EmbeddingBatch, EmbeddingProvider, EmbeddingVector
from app.embeddings.factory import build_embedding_provider, resolve_provider_metadata


class FakeGeminiProvider(EmbeddingProvider):
    def __init__(self, should_fail: bool = False) -> None:
        self._should_fail = should_fail
        self.model_name = "gemini-test-model"

    @property
    def provider_name(self) -> str:
        return "gemini"

    def embed_text(self, text: str) -> EmbeddingVector:
        if self._should_fail:
            raise RuntimeError("429 rate limit exceeded")
        return [1.0, 0.0]

    def embed_texts(self, texts: list[str]) -> EmbeddingBatch:
        if self._should_fail:
            raise RuntimeError("503 service unavailable")
        return [[1.0, 0.0] for _ in texts]


class FakeLocalProvider(EmbeddingProvider):
    def __init__(self) -> None:
        self.model_name = "local-test-model"

    @property
    def provider_name(self) -> str:
        return "local"

    def embed_text(self, text: str) -> EmbeddingVector:
        return [0.0, 1.0]

    def embed_texts(self, texts: list[str]) -> EmbeddingBatch:
        return [[0.0, 1.0] for _ in texts]


def reset_settings_cache() -> None:
    get_settings.cache_clear()


def test_build_embedding_provider_uses_configured_local_provider(
    monkeypatch,
) -> None:
    monkeypatch.setenv("EMBEDDING_PROVIDER", "local")
    reset_settings_cache()

    provider = build_embedding_provider()
    metadata = resolve_provider_metadata(provider)

    assert provider.provider_name == "local"
    assert metadata.requested_provider == "local"
    assert metadata.active_provider == "local"
    assert metadata.fallback_triggered is False

    reset_settings_cache()


def test_build_embedding_provider_falls_back_from_gemini_when_rate_limited(
    monkeypatch,
) -> None:
    monkeypatch.setenv("EMBEDDING_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(
        "app.embeddings.factory.GeminiEmbeddingProvider",
        lambda: FakeGeminiProvider(should_fail=True),
    )
    monkeypatch.setattr(
        "app.embeddings.factory.get_local_embedding_provider",
        lambda: FakeLocalProvider(),
    )
    reset_settings_cache()

    provider = build_embedding_provider()
    vectors = provider.embed_texts(["python", "fastapi"])
    metadata = resolve_provider_metadata(provider)

    assert vectors == [[0.0, 1.0], [0.0, 1.0]]
    assert metadata.requested_provider == "gemini"
    assert metadata.active_provider == "local"
    assert metadata.model_name == "local-test-model"
    assert metadata.fallback_triggered is True
    assert metadata.fallback_reason is not None
    assert "local embeddings were used instead" in metadata.fallback_reason.lower()

    reset_settings_cache()


def test_build_embedding_provider_retries_gemini_after_fallback(
    monkeypatch,
) -> None:
    class FlakyGeminiProvider(EmbeddingProvider):
        def __init__(self) -> None:
            self.calls = 0
            self.model_name = "gemini-flaky-model"

        @property
        def provider_name(self) -> str:
            return "gemini"

        def embed_text(self, text: str) -> EmbeddingVector:
            self.calls += 1
            if self.calls == 1:
                raise RuntimeError("429 rate limit exceeded")
            return [1.0, 0.0]

        def embed_texts(self, texts: list[str]) -> EmbeddingBatch:
            self.calls += 1
            if self.calls == 1:
                raise RuntimeError("429 rate limit exceeded")
            return [[1.0, 0.0] for _ in texts]

    monkeypatch.setenv("EMBEDDING_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(
        "app.embeddings.factory.GeminiEmbeddingProvider",
        FlakyGeminiProvider,
    )
    monkeypatch.setattr(
        "app.embeddings.factory.get_local_embedding_provider",
        lambda: FakeLocalProvider(),
    )
    reset_settings_cache()

    provider = build_embedding_provider()

    first_vector = provider.embed_text("python")
    first_metadata = resolve_provider_metadata(provider)
    second_vector = provider.embed_text("fastapi")
    second_metadata = resolve_provider_metadata(provider)

    assert first_vector == [0.0, 1.0]
    assert first_metadata.active_provider == "local"
    assert first_metadata.fallback_triggered is True

    assert second_vector == [1.0, 0.0]
    assert second_metadata.active_provider == "gemini"
    assert second_metadata.model_name == "gemini-flaky-model"

    reset_settings_cache()
