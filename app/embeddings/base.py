from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TypeAlias

EmbeddingVector: TypeAlias = list[float]
EmbeddingBatch: TypeAlias = list[EmbeddingVector]


class EmbeddingProvider(ABC):
    """Provider-agnostic interface for turning prepared text into vectors."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return the stable provider identifier used by the implementation."""

    @abstractmethod
    def embed_text(self, text: str) -> EmbeddingVector:
        """Embed a single prepared text string into one numeric vector."""

    @abstractmethod
    def embed_texts(self, texts: list[str]) -> EmbeddingBatch:
        """Embed multiple prepared text strings in input order."""
