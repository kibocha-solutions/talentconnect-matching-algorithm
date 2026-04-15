# Close-Call Improvement Note

## What Changed

- Added targeted close-call and hard-negative examples to
  `data/samples/training_rows.json`.
- Retrained the local XGBoost model with the expanded training set.
- Reran the external evaluation on the same 20-candidate, 3-job fixture.

## Why It Changed

The main error pattern was not retrieval failure. The main problem was
that the model had too little training coverage for realistic adjacent
profiles that sound relevant but are still not the best fit.

The clearest examples were:

- backend API candidates vs platform-observability profiles
- ML platform candidates vs adjacent infrastructure-heavy profiles
- direct stack match vs general engineering similarity

## Root-Cause Judgment

The primary issue was training data coverage.

The feature set is coarse, but it was not yet necessary to add a new
feature or change model architecture. The existing signals became more
useful once the model saw harder examples that taught it what should be
demoted in close-call comparisons.

Phase-1 similarity still matters, but this pass did not show strong
enough evidence that it needed direct reduction or architectural change.

## Before Vs After

### Backend API / observability

Before top 3:

1. `candidate-01-backend-api`
2. `candidate-03-platform-observability`
3. `candidate-19-backend-eventing`

After top 3:

1. `candidate-01-backend-api`
2. `candidate-19-backend-eventing`
3. `candidate-05-fullstack-react-python`

Interpretation:

- This improved the main close-call error because the direct backend
  eventing profile moved above the platform-observability profile.
- The platform-observability profile fell from rank 2 to rank 8.
- Obvious low-fit profiles stayed near the bottom again rather than
  floating into the middle of the list.
- A remaining weakness is that the full-stack React/Python candidate
  still ranks too high, and the backend-platform candidate dropped too
  far to rank 11.

### Frontend React / TypeScript

Before top 3:

1. `candidate-06-frontend-design-system`
2. `candidate-07-frontend-product`
3. `candidate-05-fullstack-react-python`

After top 3:

1. `candidate-06-frontend-design-system`
2. `candidate-07-frontend-product`
3. `candidate-05-fullstack-react-python`

Interpretation:

- No regression.
- This role remained the cleanest result.

### ML platform engineer

Before top 3:

1. `candidate-13-mlops-pipeline`
2. `candidate-11-ml-vision`
3. `candidate-03-platform-observability`

After top 3:

1. `candidate-13-mlops-pipeline`
2. `candidate-11-ml-vision`
3. `candidate-20-ml-nlp`

Interpretation:

- This improved the main close-call error because the platform-only
  candidate dropped from rank 3 to rank 7.
- Obvious low-fit profiles also moved lower in the list.
- The remaining weakness is that the model still prefers an NLP-heavy
  ML profile over the manually preferred applied-ML profile, which
  stayed at rank 4.

## Keep Or Revert Decision

Keep this pass.

Why:

- top-1 correctness held at 3 out of 3 jobs
- the most questionable adjacent-platform rankings improved
- no architecture change was required

## Remaining Weakness To Document

The system still struggles to separate:

- direct backend-platform fit from full-stack adjacency
- different ML subdomains when both look technically strong

That remaining weakness should be documented in the final README rather
than chased with a broader redesign in this branch.
