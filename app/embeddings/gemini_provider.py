from __future__ import annotations

from google import genai

from app.config import get_settings
from app.embeddings.base import EmbeddingBatch, EmbeddingProvider, EmbeddingVector


class GeminiEmbeddingProvider(EmbeddingProvider):
    """Gemini embedding backend for prepared text input."""

    def __init__(
        self,
        api_key: str | None = None,
        model_name: str | None = None,
    ) -> None:
        settings = get_settings()
        self._api_key = api_key or settings.gemini_api_key
        self._model_name = model_name or settings.gemini_embedding_model

        if not self._api_key:
            raise ValueError(
                "GEMINI_API_KEY is required to initialize GeminiEmbeddingProvider."
            )

        self._client = genai.Client(api_key=self._api_key)

    @property
    def provider_name(self) -> str:
        return "gemini"

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

        response = self._client.models.embed_content(
            model=self._model_name,
            contents=prepared_texts,
        )
        embeddings = response.embeddings or []
        return [list(embedding.values or []) for embedding in embeddings]

    @staticmethod
    def _validate_text(text: str) -> str:
        cleaned = text.strip()
        if not cleaned:
            raise ValueError("text must be a non-empty string.")
        return cleaned
