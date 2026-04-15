# TalentConnect Matching Algorithm

## Project Overview

This repository contains the matching-algorithm module for TalentConnect.
It is a structured-input prototype that scores how well prepared
candidate profiles match prepared job profiles.

The module consumes already-structured candidate and job input, validates
that input, generates embeddings, retrieves a semantic shortlist,
extracts ranking features, trains or loads a first-pass XGBoost ranking
model, and returns ranked match output. It is designed for local
development, sprint demonstration, and shortlist-assistance evaluation.

## Problem Being Solved

TalentConnect needs a transparent first-pass way to rank candidates
against a job once upstream systems have already produced usable
structured records.

The practical problem is not full hiring automation. The practical
problem is reducing a candidate pool into a more sensible shortlist by
combining:

- schema validation for prepared input
- embedding-based semantic retrieval
- deterministic feature extraction
- first-pass learned ranking

## Sprint Goal And Current Delivered Scope

The sprint goal was to deliver a local end-to-end matching prototype that
can be trained, exercised with sample inputs, exposed through a thin
internal API, and evaluated against a small external manual-review set.

Delivered scope in this repository:

- Pydantic schemas for candidate, job, and match output contracts
- local matching pipeline that validates, retrieves, featurizes, and
  ranks
- local and Gemini embedding-provider integration points
- semantic shortlist retrieval using prepared text views
- first-pass XGBoost ranking trainer and inference path
- sample training, demo, and evaluation datasets
- FastAPI wrapper for internal matching endpoints
- automated tests for schemas, features, trainer, ranker, pipeline, API,
  and quality checks
- external manual-vs-model evaluation artifacts and findings notes

## What The System Does End To End

At runtime, the module performs the following flow:

1. Accept prepared candidate and job payloads as Python dictionaries or
   already-instantiated schema objects.
2. Validate them against `CandidateInput` and `JobInput`.
3. Build retrieval text for each candidate and the job.
4. Generate embeddings through the configured embedding provider.
5. Retrieve a semantic shortlist with cosine similarity.
6. Extract structured ranking features for shortlisted candidates.
7. Load a trained XGBoost ranking model from local model artifacts.
8. Produce ordered match results with an overall score and score
   breakdown.

The output is a ranked list of `MatchResult` objects, plus useful
intermediate data through the internal pipeline result object.

## System Boundary And Out-Of-Scope Items

This module is intentionally narrow. It does **not** implement:

- OCR
- resume parsing
- video or audio transcription
- auth-service implementation
- database infrastructure
- background job infrastructure
- production monitoring
- model serving infrastructure beyond local script and API execution
- automated hiring decisions

It assumes candidate and job records have already been prepared by
upstream systems into the schema shape expected here.

## Architecture Summary

The system has five main layers:

- `app/schemas.py`
  Input and output contracts, validation rules, and normalization.
- `app/retrieval/`
  Embedding-backed semantic shortlist retrieval over prepared text.
- `app/features/`
  Deterministic feature extraction for each candidate-job pair.
- `app/ranking/`
  XGBoost trainer and inference ranker for first-pass scoring.
- `app/pipeline.py`
  Orchestration layer that ties validation, retrieval, feature
  extraction, and ranking together.

The FastAPI app in `app/main.py` is a thin wrapper over the pipeline.

## Project Structure

```text
app/
  config.py                  Runtime configuration
  main.py                    FastAPI app
  pipeline.py                End-to-end orchestration
  schemas.py                 Input/output schemas
  embeddings/                Embedding-provider interfaces and backends
  retrieval/                 Semantic shortlist logic
  features/                  Ranking feature extraction
  ranking/                   XGBoost training and ranking

data/samples/
  demo_match.json                    Demo payload
  training_rows.json                 Training rows for first-pass ranker
  evaluation_cases.json              Small internal-style quality fixture
  external_evaluation_dataset.json   External evaluation dataset
  external_evaluation_manual_review.json
  external_evaluation_results.json

scripts/
  demo_match.py              Local demo runner
  train_model.py             Model training entrypoint
  evaluate_quality.py        Internal evaluation helper
  run_external_evaluation.py External manual-vs-model comparison
  smoke_test_gemini.py       Gemini embedding smoke test

tests/
  test_schemas.py
  test_features.py
  test_trainer.py
  test_ranker.py
  test_pipeline.py
  test_api.py
  test_quality.py

references/
  external_evaluation_report.md
  close_call_improvement_note.md
  talentconnect_implementation_plan.md
```

## Setup Instructions

The project is designed to run locally from the repository root:

```bash
cd /home/codelf/workspace/assignments/TalentConnect/TalentConnectMatchingAlgorithm
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements-lock.txt
cp .env.example .env
```

After copying `.env.example`, update `.env` with the settings you want to
use for local execution.

## Environment And Configuration

Runtime settings are defined in `app/config.py` and loaded from `.env`.

Common variables:

- `APP_NAME`
- `ENVIRONMENT`
- `EMBEDDING_PROVIDER`
- `GEMINI_API_KEY`
- `GEMINI_EMBEDDING_MODEL`
- `LOCAL_EMBEDDING_MODEL`
- `SHORTLIST_SIZE`
- `XGBOOST_RANDOM_SEED`
- `MODEL_DIR`
- `RANKER_MODEL_PATH`
- `LOG_LEVEL`

Practical notes:

- Use `EMBEDDING_PROVIDER=local` for the most self-contained local runs.
- Use `EMBEDDING_PROVIDER=gemini` only when `GEMINI_API_KEY` is set.
- Model artifacts are stored in `models/` by default.

## How To Train The Model

The current ranker is a first-pass XGBoost model trained from labeled
rows in `data/samples/training_rows.json`.

Train with the default sample rows:

```bash
cd /home/codelf/workspace/assignments/TalentConnect/TalentConnectMatchingAlgorithm
source .venv/bin/activate
.venv/bin/python scripts/train_model.py
```

Train with an explicit model directory or row file:

```bash
.venv/bin/python scripts/train_model.py \
  --training-rows data/samples/training_rows.json \
  --model-dir models \
  --num-boost-round 48
```

Training data quality matters because this model is intentionally small
and feature-driven. The close-call evaluation pass showed that ranking
behavior changes materially when the training rows include better hard
negatives and more realistic adjacent-profile examples.

## How To Run The Demo

Run the local end-to-end demo against `data/samples/demo_match.json`:

```bash
cd /home/codelf/workspace/assignments/TalentConnect/TalentConnectMatchingAlgorithm
source .venv/bin/activate
.venv/bin/python scripts/demo_match.py
```

Optional flags:

```bash
.venv/bin/python scripts/demo_match.py \
  --demo-data data/samples/demo_match.json \
  --shortlist-size 3 \
  --model-dir models
```

## How To Run The FastAPI App

Start the thin internal API locally with Uvicorn:

```bash
cd /home/codelf/workspace/assignments/TalentConnect/TalentConnectMatchingAlgorithm
source .venv/bin/activate
.venv/bin/python -m uvicorn app.main:app --reload
```

Useful endpoints:

- `GET /`
- `GET /health`
- `POST /api/internal/match`
- `POST /api/internal/match/bulk`

OpenAPI docs are available at `/docs` when the server is running.

## How To Run Tests

Run the full test suite:

```bash
cd /home/codelf/workspace/assignments/TalentConnect/TalentConnectMatchingAlgorithm
source .venv/bin/activate
.venv/bin/python -m pytest tests -q
```

Run the external evaluation script:

```bash
.venv/bin/python scripts/run_external_evaluation.py --shortlist-size 20
```

Run the smaller internal quality helper:

```bash
.venv/bin/python scripts/evaluate_quality.py
```

## Evaluation Summary

This repository includes both an internal-style quality fixture and a
more realistic external evaluation pass.

External evaluation artifacts:

- `data/samples/external_evaluation_dataset.json`
- `data/samples/external_evaluation_manual_review.json`
- `data/samples/external_evaluation_results.json`
- `references/external_evaluation_report.md`
- `references/close_call_improvement_note.md`

Current external-evaluation takeaway:

- 3 realistic public software-related job postings were normalized into
  the project schema
- 20 anonymized composite candidate profiles were built from public
  resume-example sources
- the current system produced the correct manual top-1 match on all
  3 jobs
- close-call ordering among adjacent strong candidates remains imperfect

This means the system is behaving credibly as a shortlist-assistance
prototype, but it is not strong enough to be treated as a reliable final
decision engine.

## Known Limitations

- The module consumes prepared structured input and does not create that
  structure itself.
- Semantic retrieval and feature extraction are intentionally simple and
  local-first.
- The first-pass XGBoost ranker is trained on small curated sample data,
  not on large production hiring datasets.
- Close-call ordering between adjacent strong candidates is still
  imperfect.
- The external evaluation set is useful but small and manually
  normalized.
- Salary bands in external evaluation were normalized assumptions where
  source postings did not publish compensation.
- This project is not suitable as an automated hiring decision engine.

## Future Work

- Improve training-data breadth with more realistic hard negatives and
  broader role coverage.
- Add more direct-fit ranking signals if future evaluation shows training
  coverage alone is not enough.
- Expand evaluation beyond 3 jobs and 20 composite candidates.
- Add stronger observability, persistence, and deployment concerns only
  when the surrounding platform requires them.
- Integrate with real upstream parsing, transcription, and service
  boundaries in the larger TalentConnect system.

## Final Conclusion

This repository delivers a complete sprint-scale matching module that
validates structured candidate and job input, performs semantic
shortlisting, extracts ranking features, trains or loads a first-pass
XGBoost model, and returns ranked match output through scripts and a thin
FastAPI layer.

It is a credible prototype and project demonstration for shortlist
assistance. It is not a full hiring platform, not a production-ready
decision engine, and not a substitute for human review in real hiring
workflows.
