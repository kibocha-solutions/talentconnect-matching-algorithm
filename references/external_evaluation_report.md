# External Evaluation Report

## Purpose

This pass compares manual human review against the current ranking
algorithm on a small but more realistic external dataset.

The goal was not statistical rigor. The goal was to test whether the
system behaves sensibly when given public job-posting inputs and a
believable anonymized candidate pool built from public resume examples.

## Execution Context

The evaluation script now honors `EMBEDDING_PROVIDER` from settings
before it builds the pipeline.

For the latest rerun of
`.venv/bin/python scripts/run_external_evaluation.py --shortlist-size 20`,
the configured provider was Gemini. The script attempted Gemini first,
received a `429 RESOURCE_EXHAUSTED` quota error from the Gemini
embedding API, and then explicitly fell back to the local embedding
provider.

The resulting evaluation artifact therefore records:

- requested provider: `gemini`
- active provider after fallback: `local`
- active model: `sentence-transformers/all-MiniLM-L6-v2`
- fallback reason: Gemini quota exhaustion during embedding

## Sources Used

### Public job postings

- Apollo Research backend role:
  `https://jobs.lever.co/apolloresearch/94581287-e3ac-40b6-90e2-438e0ca9064a`
  The public posting describes Python-heavy backend work focused on
  scalable systems, reliable APIs, and production service ownership.
- Relay frontend role:
  `https://jobs.lever.co/relay/c6b3b4ee-c526-4ebf-af06-a8f9e9090178`
  The public posting emphasizes React, TypeScript, frontend quality,
  validation, and polished interface delivery.
- OSARO machine learning role:
  `https://jobs.lever.co/osaro/0b82d7e0-bed2-46d0-841f-336c1bc637bd`
  The public posting emphasizes Python, TensorFlow, ML product work,
  data pipelines, and production ML workflows.

### Public resume-example sources

- Resume Worded backend developer resume example:
  `https://resumeworded.com/backend-developer-resume-example`
- BeamJobs React resume examples:
  `https://www.beamjobs.com/resumes/react-developer-resume-examples`
- Resume Worded React developer resume example:
  `https://resumeworded.com/react-developer-resume-example`
- BeamJobs machine learning resume examples:
  `https://www.beamjobs.com/resumes/machine-learning-resume-examples`
- Resume Worded machine learning engineer resume example:
  `https://resumeworded.com/machine-learning-engineer-resume-example`
- Resume Worded data engineer resume example:
  `https://resumeworded.com/data-engineer-resume-example`
- BeamJobs data engineer resume examples:
  `https://www.beamjobs.com/resumes/data-engineer-resume-examples`
- BeamJobs analytics engineer resume examples:
  `https://www.beamjobs.com/resumes/data-analytics-engineer-resume-examples`

## How The Candidate Pool Was Built

- I did not use private CVs or scrape random people.
- I used public resume-example pages as pattern sources only.
- I built 20 anonymized composite profiles from those patterns.
- Each composite profile was normalized into the project schema with:
  skills, experience, salary expectation, optional portfolio, extracted
  text, and video transcript text.
- Job postings were also normalized into the project schema.
- Salary bands for jobs were assumed for evaluation purposes because the
  project schema requires them and the chosen public postings do not all
  publish compensation.

The resulting files are:

- `data/samples/external_evaluation_dataset.json`
- `data/samples/external_evaluation_manual_review.json`
- `data/samples/external_evaluation_results.json`

## Manual Expectations Before Running The Model

### Backend API / observability job

- Expected top candidate: `candidate-01-backend-api`
- Expected top 3:
  `candidate-01-backend-api`,
  `candidate-19-backend-eventing`,
  `candidate-18-devops-backend`
- Obvious low-fit candidates:
  `candidate-16-support-generalist`,
  `candidate-17-junior-web`,
  `candidate-06-frontend-design-system`

Reasoning:

- Python, FastAPI, SQL, and API depth should dominate.
- Kafka and production operations should help.
- Clearly non-backend profiles should fall near the bottom.

### Frontend React / TypeScript job

- Expected top candidate: `candidate-06-frontend-design-system`
- Expected top 3:
  `candidate-06-frontend-design-system`,
  `candidate-07-frontend-product`,
  `candidate-05-fullstack-react-python`
- Obvious low-fit candidates:
  `candidate-16-support-generalist`,
  `candidate-11-ml-vision`,
  `candidate-19-backend-eventing`

Reasoning:

- React and TypeScript should dominate.
- Design-system and testing depth should matter.
- Pure backend or ML profiles should not stay competitive.

### ML platform engineer job

- Expected top candidate: `candidate-13-mlops-pipeline`
- Expected top 3:
  `candidate-13-mlops-pipeline`,
  `candidate-11-ml-vision`,
  `candidate-12-applied-ml`
- Obvious low-fit candidates:
  `candidate-16-support-generalist`,
  `candidate-17-junior-web`,
  `candidate-08-frontend-vue`

Reasoning:

- The role mixes model work and production ML operations.
- TensorFlow plus orchestration and cloud infrastructure should beat
  either pure research or pure data warehousing alone.

## Actual Algorithm Output

### Backend API / observability job

Actual top 5:

1. `candidate-01-backend-api` - 88.78
2. `candidate-19-backend-eventing` - 88.30
3. `candidate-18-devops-backend` - 84.81
4. `candidate-05-fullstack-react-python` - 78.48
5. `candidate-03-platform-observability` - 78.24

Low-fit placements:

- `candidate-16-support-generalist` ranked 20th
- `candidate-17-junior-web` ranked 17th
- `candidate-06-frontend-design-system` ranked 14th

### Frontend React / TypeScript job

Actual top 5:

1. `candidate-06-frontend-design-system` - 92.29
2. `candidate-07-frontend-product` - 91.99
3. `candidate-05-fullstack-react-python` - 87.78
4. `candidate-09-mobile-frontend` - 77.77
5. `candidate-08-frontend-vue` - 74.38

Low-fit placements:

- `candidate-16-support-generalist` ranked 20th
- `candidate-11-ml-vision` ranked 10th
- `candidate-19-backend-eventing` ranked 13th

### ML platform engineer job

Actual top 5:

1. `candidate-13-mlops-pipeline` - 92.90
2. `candidate-11-ml-vision` - 92.34
3. `candidate-20-ml-nlp` - 81.87
4. `candidate-12-applied-ml` - 78.48
5. `candidate-03-platform-observability` - 76.74

Low-fit placements:

- `candidate-16-support-generalist` ranked 20th
- `candidate-17-junior-web` ranked 15th
- `candidate-08-frontend-vue` ranked 17th

## Where The Algorithm Matched Human Judgment

- It matched the expected top candidate on all 3 jobs.
- It kept the obvious non-engineering generalist at the bottom across
  all 3 jobs.
- It handled the frontend job especially well. The full expected top 3
  appeared in the exact expected order.
- It correctly rewarded the MLOps-shaped candidate for the ML job and
  kept the expected top candidate at rank 1.

## Where The Algorithm Diverged

- Backend job:
  `candidate-05-fullstack-react-python` landed 4th and beat a more
  platform-observability-shaped profile. That still feels a bit generous.
- ML job:
  `candidate-20-ml-nlp` ranked 3rd ahead of `candidate-12-applied-ml`.
  This is still a plausible shortlist outcome, but it is the clearest
  remaining close-call disagreement with the manual review.
- Frontend job:
  A backend engineer still reached 13th and an ML engineer reached 10th.
  Those are not dangerous results, but they show the system does not
  sharply collapse unrelated technical profiles once they share generic
  engineering language.

## Likely Causes Of Good And Bad Results

### Good results

- The role-specialist profiles had clean skill overlap.
- Portfolio heuristics favored candidates with concrete shipped work.
- Retrieval plus ranker together were good enough to separate strong
  specialists from obvious low-fit profiles.

### Bad results

- The feature set is still fairly coarse:
  required-skill similarity, nice-to-have similarity, experience,
  salary overlap, portfolio heuristic, and phase-1 semantic similarity.
- Because of that, adjacent technical language can travel too far.
  Full-stack, ML, and platform-adjacent candidates can stay competitive
  on nearby roles if their summaries mention enough shared engineering
  concepts.
- The portfolio scoring is intentionally simple. Many strong candidates
  receive the same `100` portfolio score, so that field stops helping
  differentiate nuanced cases.
- The ranker was trained on a small internal-style fixture, so it still
  reflects a narrow worldview of what "good" looks like.

## Overall Judgment

The current algorithm is behaving better than a random or naive keyword
matcher. On this small external pass, it selected the human-expected top
candidate for all three roles and kept obvious low-fit profiles low.

That said, the system is not deeply discerning yet. The top-3 lists show
that it still overvalues adjacent engineering similarity, especially
backend-platform language, and can rank a generally strong engineer above
someone with more direct domain depth.

My honest read is:

- top-1 behavior is promising
- top-3 behavior is only moderately trustworthy
- nuanced domain ranking is still weak
- the model is usable as a shortlist aid, not as a decisive evaluator

## Recommended README Caveats

If this project gets a final `README.md`, it should explicitly say:

- the evaluation set includes manually normalized salary assumptions
- the candidate pool is anonymized and composite, not real applicant data
- current ranking quality looks reasonable for coarse shortlist support
- current ranking quality is not strong enough for automated hiring
  decisions or high-confidence ordering among closely matched candidates
