from __future__ import annotations

from functools import lru_cache
from threading import RLock

from sentence_transformers import SentenceTransformer

from app.config import get_settings
from app.embeddings.base import EmbeddingBatch, EmbeddingProvider, EmbeddingVector


class LocalEmbeddingProvider(EmbeddingProvider):
    """Local sentence-transformer embedding backend for prepared text input."""

    def __init__(self, model_name: str | None = None) -> None:
        settings = get_settings()
        self._model_name = model_name or settings.local_embedding_model
        # Force CPU and disable low-memory loading to avoid meta-tensor init failures.
        self._model = SentenceTransformer(
            self._model_name,
            device="cpu",
            model_kwargs={"low_cpu_mem_usage": False},
        )
        self._encode_lock = RLock()

    @property
    def provider_name(self) -> str:
        return "local"

    @property
    def model_name(self) -> str:
        return self._model_name

    def embed_text(self, text: str) -> EmbeddingVector:
        vectors = self.embed_texts([text])
        return vectors[0]

    def embed_texts(self, texts: list[str]) -> EmbeddingBatch:
        prepared_texts = [self._validate_text(text) for text in texts]
        if not prepared_texts:
            raise ValueError("texts must contain at least one non-empty string.")

        # SentenceTransformer inference can fail intermittently under concurrent calls.
        # Serialize encode access on a shared provider instance to keep results stable.
        with self._encode_lock:
            embeddings = self._model.encode(prepared_texts, convert_to_numpy=True)
        return embeddings.astype(float).tolist()

    @staticmethod
    def _validate_text(text: str) -> str:
        cleaned = text.strip()
        if not cleaned:
            raise ValueError("text must be a non-empty string.")
        return cleaned


@lru_cache(maxsize=1)
def get_local_embedding_provider() -> LocalEmbeddingProvider:
    return LocalEmbeddingProvider()
