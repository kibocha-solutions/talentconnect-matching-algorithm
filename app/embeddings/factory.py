from __future__ import annotations

from dataclasses import dataclass
from threading import RLock

from app.config import get_settings
from app.embeddings.base import EmbeddingBatch, EmbeddingProvider, EmbeddingVector
from app.embeddings.gemini_provider import GeminiEmbeddingProvider
from app.embeddings.local_provider import get_local_embedding_provider

_FALLBACK_HINTS = (
    "429",
    "500",
    "502",
    "503",
    "504",
    "connection",
    "deadline",
    "dns",
    "internal",
    "network",
    "protocol error",
    "remoteprotocolerror",
    "rate limit",
    "resource exhausted",
    "server disconnected",
    "service unavailable",
    "timed out",
    "timeout",
    "transport",
    "unavailable",
    "without sending a response",
)


@dataclass(frozen=True, slots=True)
class EmbeddingProviderResolution:
    """Stable provider metadata for logs, reports, and evaluation artifacts."""

    requested_provider: str
    active_provider: str
    model_name: str
    fallback_triggered: bool
    fallback_reason: str | None


class ConfiguredEmbeddingProvider(EmbeddingProvider):
    """Resolve the configured embedding backend and apply controlled fallback."""

    def __init__(self) -> None:
        settings = get_settings()
        self._requested_provider = settings.embedding_provider
        self._fallback_triggered = False
        self._fallback_reason: str | None = None
        self._provider_lock = RLock()
        self._provider = self._build_primary_provider()
        self._active_provider_name = self._provider.provider_name
        self._active_model_name = getattr(self._provider, "model_name", "unknown")

    @property
    def provider_name(self) -> str:
        with self._provider_lock:
            return self._active_provider_name

    @property
    def model_name(self) -> str:
        with self._provider_lock:
            return self._active_model_name

    @property
    def resolution(self) -> EmbeddingProviderResolution:
        return EmbeddingProviderResolution(
            requested_provider=self._requested_provider,
            active_provider=self.provider_name,
            model_name=self.model_name,
            fallback_triggered=self._fallback_triggered,
            fallback_reason=self._fallback_reason,
        )

    def embed_text(self, text: str) -> EmbeddingVector:
        return self._run_with_fallback(lambda provider: provider.embed_text(text))

    def embed_texts(self, texts: list[str]) -> EmbeddingBatch:
        return self._run_with_fallback(lambda provider: provider.embed_texts(texts))

    def _build_primary_provider(self) -> EmbeddingProvider:
        settings = get_settings()
        if settings.prefers_gemini_embeddings:
            if not settings.gemini_api_key:
                self._fallback_triggered = True
                self._fallback_reason = (
                    "Gemini embeddings were requested but GEMINI_API_KEY was not configured. "
                    "Local embeddings were used instead."
                )
                return get_local_embedding_provider()
            return GeminiEmbeddingProvider()
        return get_local_embedding_provider()

    def _run_with_fallback(self, operation):
        with self._provider_lock:
            provider = self._provider

        try:
            result = operation(provider)
            with self._provider_lock:
                self._active_provider_name = provider.provider_name
                self._active_model_name = getattr(provider, "model_name", "unknown")
            return result
        except Exception as exc:
            if not self._should_fallback(exc, provider.provider_name):
                raise

            local_provider = get_local_embedding_provider()
            with self._provider_lock:
                if provider.provider_name == "gemini":
                    self._fallback_triggered = True
                    self._fallback_reason = (
                        "Gemini embedding request failed and local embeddings were used "
                        f"instead: {type(exc).__name__}: {exc}"
                    )
            result = operation(local_provider)
            with self._provider_lock:
                self._active_provider_name = local_provider.provider_name
                self._active_model_name = getattr(local_provider, "model_name", "unknown")
            return result

    def _should_fallback(self, exc: Exception, provider_name: str) -> bool:
        if self._requested_provider != "gemini":
            return False
        if provider_name != "gemini":
            return False

        message = str(exc).lower()
        return any(hint in message for hint in _FALLBACK_HINTS)


def build_embedding_provider() -> EmbeddingProvider:
    """Instantiate the configured embedding provider for default pipeline flows."""

    return ConfiguredEmbeddingProvider()


def resolve_provider_metadata(
    embedding_provider: EmbeddingProvider,
) -> EmbeddingProviderResolution:
    """Normalize provider metadata for scripts and persisted evaluation output."""

    resolution = getattr(embedding_provider, "resolution", None)
    if isinstance(resolution, EmbeddingProviderResolution):
        return resolution

    provider_name = embedding_provider.provider_name
    return EmbeddingProviderResolution(
        requested_provider=provider_name,
        active_provider=provider_name,
        model_name=getattr(embedding_provider, "model_name", "unknown"),
        fallback_triggered=False,
        fallback_reason=None,
    )
