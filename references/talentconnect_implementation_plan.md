# TalentConnect Matching Algorithm Implementation Plan

## Project Location

Relative project path: `~/workspace/assignments/TalentConnect/TalentConnectMatchingAlgorithm`

## Purpose

Build a working v1 matching algorithm module that satisfies the PRD in substance under the current deadline and scope.

This delivery is **algorithm-first**, not full-platform. The module will consume already-prepared candidate and job data. It will **not** perform document retrieval, resume parsing, OCR, transcription, sanitization, authentication-service implementation, or full database/infrastructure setup.

## Delivery Standard

The project will be considered complete for this sprint when it can:

1. accept valid structured candidate and job inputs,
2. generate embeddings using a configurable provider,
3. retrieve a semantically relevant candidate shortlist,
4. extract meaningful ranking features,
5. score and rank candidates sensibly,
6. demonstrate a real first-pass trained model,
7. expose a usable callable flow and, if time permits, a minimal FastAPI interface,
8. document boundaries, assumptions, and deferred hardening work honestly.

## Scope for This Sprint

### In scope

- Config-driven embedding provider selection
- Gemini embedding support
- Local sentence-transformer fallback/support
- Candidate and job schemas
- In-memory vector retrieval using cosine similarity
- Feature extraction for matching
- First-pass XGBoost ranking model
- Model save/load
- End-to-end matching pipeline
- Sample data and demonstration scripts
- Minimal tests for schemas, features, and pipeline
- Optional FastAPI internal endpoints if time permits

### Explicitly out of scope for this sprint

- Resume/PDF/DOC parsing
- Video transcription
- Input sanitization/redaction pipeline
- Production auth service integration
- Relational database integration
- Chroma or managed vector database integration
- Full behavioral event storage infrastructure
- Full monitoring/alert routing stack
- Mature adaptive retraining automation
- Production-grade deployment packaging

## Implementation Principles

- Meet the PRD **in substance**, not by overbuilding every enterprise concern.
- Bias toward an end-to-end working pipeline over infrastructure polish.
- Keep the code modular so stronger infrastructure can be added later.
- Preserve honest system boundaries: upstream systems provide prepared inputs.
- Use configuration and abstractions so Gemini/local embedding backends can be switched without rewriting the pipeline.

## Agreed Working Environment

- We will **most likely not use Colab after all**.
- Primary development and execution will happen in the local project environment at `~/workspace/assignments/TalentConnect/TalentConnectMatchingAlgorithm`.
- The project will rely on the existing local virtual environment, `.env`, and `requirements-lock.txt`.
- Any optional cloud execution remains secondary and is not part of the working plan.

## Agreed Project File Structure

```text
TalentConnectMatchingAlgorithm/
├── .env
├── .env.example
├── requirements-lock.txt
├── README.md
├── TalentConnect_PRD.pdf
├── app/
│   ├── __init__.py
│   ├── config.py
│   ├── schemas.py
│   ├── logging_config.py
│   ├── main.py
│   ├── pipeline.py
│   ├── embeddings/
│   │   ├── __init__.py
│   │   ├── base.py
│   │   ├── local_provider.py
│   │   └── gemini_provider.py
│   ├── retrieval/
│   │   ├── __init__.py
│   │   └── retriever.py
│   ├── features/
│   │   ├── __init__.py
│   │   └── extractor.py
│   ├── ranking/
│   │   ├── __init__.py
│   │   ├── ranker.py
│   │   └── trainer.py
│   └── utils/
│       ├── __init__.py
│       └── helpers.py
├── data/
│   ├── raw/
│   ├── processed/
│   └── samples/
├── models/
├── notebooks/
├── scripts/
│   ├── smoke_test_gemini.py
│   ├── train_model.py
│   └── demo_match.py
└── tests/
    ├── __init__.py
    ├── test_schemas.py
    ├── test_features.py
    └── test_pipeline.py
```

## Chosen Technical Approach

### Core stack

- **Pydantic / pydantic-settings** for config and schema validation
- **NumPy** for vector and numerical operations
- **scikit-learn** for cosine similarity and utility functions
- **XGBoost** for the first learned ranking model
- **joblib** for model persistence
- **FastAPI** for a minimal internal API wrapper if time allows

### Embedding strategy

- Support both:
  - **Gemini** provider via `google-genai`
  - **Local** provider via `sentence-transformers`
- The codebase will be provider-agnostic behind a shared interface.
- Gemini access is confirmed working.
- Real secret remains in `.env`; `.env.example` stays public.

### Retrieval strategy

- Use **in-memory embeddings + cosine similarity** for shortlist generation.
- Do **not** require Chroma for this sprint.
- Design retrieval cleanly so a vector DB can be added later.

### Ranking strategy

- Use **XGBoost** for the first-pass learned scoring model.
- Ranking will combine semantic retrieval and engineered features.
- A cold-start / initial training dataset will be used to produce a real trained model in substance.

## System Boundary

The matching module assumes upstream systems provide already-extracted, already-structured candidate and job records conforming to the expected schemas.

The module:

- validates inputs,
- embeds relevant text,
- retrieves candidate shortlists,
- extracts ranking features,
- scores and ranks candidates,
- supports first-pass model training,
- returns structured match results.

The module does **not**:

- retrieve source files,
- parse resumes,
- transcribe videos,
- sanitize raw personal data,
- manage full platform auth,
- own persistence infrastructure beyond local artifacts for this sprint.

## Definition of “Complete” for This Sprint

The sprint is complete when the following are all true:

### 1. Configuration works

- `.env` loads successfully through a single config layer.
- Embedding provider can be switched by config.
- Gemini key is read from environment, not hardcoded in project code.

### 2. Schemas work

- Candidate profile schema validates required input fields.
- Job post schema validates required input fields.
- Match result schema represents final output cleanly.

### 3. Embedding layer works

- Local embedding provider works.
- Gemini embedding provider works.
- A provider factory or equivalent selection mechanism exists.

### 4. Retrieval works

- Candidate embeddings can be generated and stored in memory.
- Job input can be embedded and compared against candidate embeddings.
- Top-N shortlist is returned in descending similarity order.

### 5. Feature extraction works

- At minimum, the pipeline computes:
  - required-skills semantic similarity,
  - nice-to-have-skills semantic similarity,
  - experience alignment/gap,
  - salary overlap,
  - portfolio score,
  - phase-1 similarity score.
- Feature vectors are numeric and complete.

### 6. Ranking works

- A first-pass XGBoost model is trained on a prepared dataset.
- The model can score candidate-job pairs.
- Ranked output is sensible and human-defensible.

### 7. Pipeline works end to end

- Given sample candidate and job inputs, the system returns an ordered list of candidates with scores and breakdowns.
- The results reflect semantic closeness and structured fit rather than naive keyword matching.

### 8. Demo artifacts exist

- Sample data exists.
- A demo script exists.
- A training script exists.
- A Gemini smoke-test script exists.
- Model artifact(s) can be saved to `models/`.

### 9. Documentation exists

- README explains setup, scope, boundary, how to run, and what is deferred.
- `.env.example` documents required config.

### 10. Basic test coverage exists

- Schema validation test
- Feature extraction sanity test
- Pipeline smoke test

## Work Sequence

## Phase 1: Foundation

### Goal

Establish project configuration, schemas, and provider abstraction.

### Tasks

1. Implement `app/config.py`
2. Finalize `.env.example`
3. Implement `app/schemas.py`
4. Define embedding provider interface in `app/embeddings/base.py`
5. Implement local provider
6. Implement Gemini provider
7. Add Gemini smoke test script

### Expected result

A configurable project that can validate inputs and obtain embeddings from either backend.

## Phase 2: Retrieval Core

### Goal

Build semantic shortlist generation.

### Tasks

1. Implement candidate text assembly strategy
2. Implement job text assembly strategy
3. Generate candidate embeddings
4. Embed job input
5. Compute cosine similarity
6. Return top-N shortlist with similarity scores

### Expected result

The system can retrieve semantically plausible candidate shortlists from a provided candidate pool.

## Phase 3: Feature Engineering

### Goal

Translate candidate-job pairs into structured ranking inputs.

### Tasks

1. Implement required-skill similarity
2. Implement nice-to-have-skill similarity
3. Implement experience alignment/gap feature
4. Implement salary overlap feature
5. Implement portfolio score heuristic
6. Include phase-1 similarity as a carried feature
7. Return complete feature vectors

### Expected result

Every shortlisted candidate receives a consistent numerical feature vector.

## Phase 4: First-Pass Training

### Goal

Produce a real trained ranking/scoring model.

### Tasks

1. Create sample/labeled candidate-job training data
2. Build training feature matrix
3. Train XGBoost model
4. Evaluate it at a practical sanity level
5. Save model artifact to `models/`

### Expected result

A real first-pass learned model exists and can be loaded for inference.

## Phase 5: End-to-End Ranking Pipeline

### Goal

Connect retrieval, features, and model inference into one pipeline.

### Tasks

1. Implement pipeline orchestration in `app/pipeline.py`
2. Load embeddings/model as needed
3. Retrieve shortlist
4. Extract features for shortlist
5. Score and rank results
6. Return structured match results

### Expected result

One callable flow takes inputs and returns ranked outputs end to end.

## Phase 6: Serving and Demo

### Goal

Make the pipeline runnable and demonstrable.

### Tasks

1. Implement `scripts/demo_match.py`
2. Implement `scripts/train_model.py`
3. Implement minimal FastAPI interface in `app/main.py` if time allows
4. Add sample JSON or Python fixtures in `data/samples/`

### Expected result

The project can be run locally for training and matching demos, with optional API endpoints.

## Phase 7: Tests and Handoff

### Goal

Stabilize and present cleanly.

### Tasks

1. Add schema tests
2. Add feature tests
3. Add pipeline smoke test
4. Write README
5. Confirm what is delivered vs deferred

### Expected result

A demonstrable codebase with a clear handoff story and minimal breakage risk.

## File-Level Build Order

1. `app/config.py`
2. `app/schemas.py`
3. `app/embeddings/base.py`
4. `app/embeddings/local_provider.py`
5. `app/embeddings/gemini_provider.py`
6. `scripts/smoke_test_gemini.py`
7. `app/retrieval/retriever.py`
8. `app/features/extractor.py`
9. `app/ranking/trainer.py`
10. `app/ranking/ranker.py`
11. `app/pipeline.py`
12. `scripts/train_model.py`
13. `scripts/demo_match.py`
14. `app/main.py`
15. tests
16. `README.md`

## Practical Acceptance Criteria

At the end of this sprint, we should be able to say:

- The algorithm accepts valid prepared candidate and job data.
- It computes embeddings using a configurable backend.
- It retrieves semantically similar candidates.
- It converts candidates into meaningful feature vectors.
- It uses a real trained XGBoost model to score/rank candidates.
- It produces results that make human sense.
- It includes working scripts for smoke testing, training, and demo matching.
- It cleanly states that preprocessing and full platform services are upstream/downstream concerns.

## Deferred Work After This Sprint

These items remain valid future enhancements, but are not required for this delivery:

- Chroma/vector database integration
- Full behavioral event pipeline and storage
- Adaptive retraining thresholds and diversity logic
- Production monitoring and alert routing
- Auth service integration
- Real DB persistence
- Cache invalidation and resilient degraded-mode policies
- Expanded evaluation dataset and stronger validation regime
- Production deployment packaging

## Execution Priority Rule

Whenever time pressure forces a choice, prioritize in this order:

1. End-to-end matching pipeline works
2. Ranking is sensible
3. First-pass model is real and saved
4. Demo scripts work
5. Minimal API exists
6. Tests and documentation are present
7. Deferred hardening is merely documented

This is the plan we are following.

