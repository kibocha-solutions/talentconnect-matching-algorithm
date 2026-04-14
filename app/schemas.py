from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

NormalizedText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
CurrencyCode = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=3, max_length=3),
]
SkillName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class TalentConnectBaseModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class SalaryRange(TalentConnectBaseModel):
    currency: CurrencyCode
    min_amount: float = Field(ge=0)
    max_amount: float = Field(ge=0)

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        return value.upper()

    @model_validator(mode="after")
    def validate_amounts(self) -> "SalaryRange":
        if self.max_amount < self.min_amount:
            raise ValueError("max_amount must be greater than or equal to min_amount.")
        return self


class ExperienceRange(TalentConnectBaseModel):
    min_years: float = Field(ge=0)
    max_years: float = Field(ge=0)

    @model_validator(mode="after")
    def validate_range(self) -> "ExperienceRange":
        if self.max_years < self.min_years:
            raise ValueError("max_years must be greater than or equal to min_years.")
        return self


class PortfolioProject(TalentConnectBaseModel):
    title: NormalizedText
    description: Annotated[str, StringConstraints(strip_whitespace=True, min_length=20)]
    url: str | None = None
    technologies: list[SkillName] = Field(default_factory=list)

    @field_validator("technologies")
    @classmethod
    def normalize_technologies(cls, values: list[str]) -> list[str]:
        return _normalize_unique_strings(values)


class CandidateInput(TalentConnectBaseModel):
    candidate_id: UUID
    skills: list[SkillName] = Field(min_length=1)
    years_of_experience: float = Field(ge=0)
    salary_expectation: SalaryRange
    portfolio_projects: list[PortfolioProject] = Field(default_factory=list)
    extracted_text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=40)]
    video_transcript: Annotated[
        str | None, StringConstraints(strip_whitespace=True, min_length=20)
    ] = None

    @field_validator("skills")
    @classmethod
    def normalize_skills(cls, values: list[str]) -> list[str]:
        normalized = _normalize_unique_strings(values)
        if not normalized:
            raise ValueError("skills must contain at least one non-empty value.")
        return normalized


class JobInput(TalentConnectBaseModel):
    job_id: UUID
    employer_id: UUID
    required_skills: list[SkillName] = Field(min_length=1)
    nice_to_have_skills: list[SkillName] = Field(default_factory=list)
    experience_range: ExperienceRange
    salary_offered: SalaryRange
    job_description_text: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=40)
    ]
    portfolio_required: bool = False

    @field_validator("required_skills", "nice_to_have_skills")
    @classmethod
    def normalize_skill_groups(cls, values: list[str]) -> list[str]:
        normalized = _normalize_unique_strings(values)
        return normalized


class ScoreBreakdown(TalentConnectBaseModel):
    skills_score: float = Field(ge=0, le=100)
    experience_score: float = Field(ge=0, le=100)
    salary_score: float = Field(ge=0, le=100)
    portfolio_score: int = Field()

    @field_validator("portfolio_score")
    @classmethod
    def validate_portfolio_score(cls, value: int) -> int:
        if value not in {0, 30, 100}:
            raise ValueError("portfolio_score must be one of 0, 30, or 100.")
        return value


class MatchResult(TalentConnectBaseModel):
    candidate_id: UUID
    job_id: UUID
    overall_score: float = Field(ge=0, le=100)
    score_breakdown: ScoreBreakdown
    matched_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


def _normalize_unique_strings(values: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()

    for value in values:
        cleaned = value.strip()
        if not cleaned:
            continue
        dedupe_key = cleaned.casefold()
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        normalized.append(cleaned)

    return normalized
