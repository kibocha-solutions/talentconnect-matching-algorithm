# Walkthrough

## 2026-04-17 - Match row full-page detail route

**Context**: Match row clicks still opened a right-side detail sheet,
while the preferred UX is full-page detail navigation with Back action.

**Actions Taken**:
- Updated `match-runs-page-client` row click behavior to navigate to a
  dedicated dynamic route instead of opening a `Sheet`.
- Removed the side-sheet detail implementation from Match Runs.
- Added dynamic route page:
  - `frontend/app/(console)/match-runs/[jobId]/[candidateId]/page.tsx`
- Added full-page detail client:
  - `frontend/components/match-runs/match-result-page-client.tsx`
- Added robust parsing/fallback handling when route detail payload is
  missing or malformed.

**Technical Decisions**:
- Reuse route pattern consistency from Jobs/Applications detail flows.
- Pass selected result details via query payload to avoid introducing a
  new global store contract in this pass.

**Standards Applied**:
- Programming: targeted route/navigation update only.
- Security: no sensitive transport or credential behavior changes.
- Testing: frontend lint and production build.

**Outcomes**:
- Clicking a matched row now opens a dedicated full-page detail view.
- Dynamic route compiled successfully:
  - `/match-runs/[jobId]/[candidateId]`
- Validation passed:
  - `npm run lint`
  - `npm run build`

**Known Issues/Tech Debt**:
- Match detail page currently depends on route query payload from list
  navigation; direct deep-link entry without payload shows a fallback
  message by design.

---

## 2026-04-17 - Match runs TC-500 fix

**Context**: The Match Runs UI reported `TC-500-INTERNAL_ERROR` while
API health remained reachable.

**Actions Taken**:
- Pulled backend logs and confirmed repeated 500s on
  `POST /api/internal/match`.
- Reproduced failures with scripted endpoint calls across all default
  jobs.
- Verified the matching pipeline itself succeeds in-process with valid
  payloads.
- Identified API-level per-request pipeline initialization as the likely
  failure trigger under repeated/concurrent calls.
- Updated `app/main.py` to cache default and local-fallback pipelines via
  `lru_cache`.
- Ran backend API tests and restarted backend.
- Re-ran endpoint probes: all 15 default jobs returned 200.

**Technical Decisions**:
- Keep request/response contracts unchanged and fix reliability in the API
  composition layer only.
- Cache both pipeline variants to prevent repeated heavy model/provider
  initialization.

**Standards Applied**:
- Programming: minimal backend-only fix.
- Security: no auth, secret, or transport changes.
- Testing: `tests/test_api.py` and live endpoint probes.

**Outcomes**:
- Match endpoint stability restored for seeded multi-job runs.
- Validation passed:
  - `/home/codelf/workspace/assignments/TalentConnect/TalentConnectMatchingAlgorithm/.venv/bin/python -m pytest tests/test_api.py -q`
  - endpoint probe across default jobs (`ok 15 err 0`)

**Known Issues/Tech Debt**:
- Frontend still runs all selected jobs concurrently; this is now stable,
  but sequential mode can be added later for controlled pacing.

---

## 2026-04-17 - Row-click detail routing and README clarification

**Context**: Create flows already used full pages, but row clicks still
felt inconsistent with route-based navigation. The README also needed a
clear explanation of frontend vs backend responsibilities and `run.sh`
workflows.

**Actions Taken**:
- Updated table and mobile row click interactions in jobs and
  applications list pages to route to dynamic detail pages.
- Added route-backed detail screens with Back navigation:
  - `frontend/app/(console)/jobs/[jobId]/page.tsx`
  - `frontend/app/(console)/applications/[candidateId]/page.tsx`
- Added detail page clients:
  - `frontend/components/jobs/job-details-page-client.tsx`
  - `frontend/components/applications/application-details-page-client.tsx`
- Added lightweight detail actions (show/hide, archive, delete) that
  update workspace state and emit timeline/toast feedback.
- Updated `README.md` with:
  - explicit backend vs frontend boundary section
  - direct frontend run commands
  - practical `run.sh` usage examples and selection guidance
- Resolved lint warnings and strict TypeScript type errors introduced by
  routing changes.

**Technical Decisions**:
- Keep this pass focused on row-click consistency and documentation.
- Reuse existing workspace state primitives for detail page actions.
- Prefer Back-button page flow over sheet-only details for primary row
  interactions.

**Standards Applied**:
- Programming: minimal focused changes with no unrelated UI refactors.
- Security: no secret or credential-handling behavior changes.
- Testing: validated through frontend lint and production build.

**Outcomes**:
- Row clicks now open dedicated detail pages for both Jobs and
  Applications.
- Dynamic routes are present in production build output:
  - `/jobs/[jobId]`
  - `/applications/[candidateId]`
- README now clearly documents frontend/backend scope and how to use
  `run.sh` for local operations.
- Validation passed:
  - `npm run lint`
  - `npm run build`

**Known Issues/Tech Debt**:
- Edit workflows remain on list-page sheets by design in this pass.

---

## 2026-04-17 - Auto fallback to local embeddings

**Context**: Gemini embedding failures were surfacing as API errors during local demo runs. Goal is to automatically retry failures with local embeddings and make the provider visible in the UI.

**Actions Taken**:
- Initialized artifact files under `.github/artifacts/`.
- Inspected backend embedding provider resolution and API error mapping.
- Inspected frontend matching results rendering and existing CSS primitives.
- Implemented backend retry to local embeddings when Gemini embedding failures occur.
- Implemented config-time Gemini to local fallback when `GEMINI_API_KEY` is missing.
- Updated frontend result cards to include a provider chip and local card styling.
- Added API regression test to ensure Gemini embedding failures return a 200 local fallback response.
- Validated Python and frontend tests.
- Improved Matching results UX: provider chip in header, better wrapping for long IDs, metadata alignment on small screens.

**Outcomes**:
- API no longer returns TC-503/TC-429 for Gemini embedding failures during match runs when local fallback is available.
- UI shows provider chip (`local` or `gemini`) per result card and highlights local-backed runs.
- Test suites passing: `./.venv/bin/python -m pytest -q` and `cd frontend && npm test`.
- Matching results UI is more readable and responsive on narrow viewports.

---

## 2026-04-17 - Add flow and data label correction

**Context**: Follow-up feedback reported two remaining issues: add forms
still felt like right-side overlays, and application sample records
showed awkward candidate naming due to fallback label inference.

**Actions Taken**:
- Updated Jobs list page to route Add action to `/jobs/new` and keep side
  sheet usage for edit-only.
- Updated Applications list page to route Add action to
  `/applications/new` and keep side sheet usage for edit-only.
- Added full-page create flows with Back button:
  - `frontend/components/jobs/job-create-page-client.tsx`
  - `frontend/components/applications/application-create-page-client.tsx`
  - route wiring in `/jobs/new` and `/applications/new`.
- Updated Overview quick actions to use new route-based add pages.
- Added explicit `candidate_label` fields to both sample seed sources:
  - `frontend/src/data/default-applications.json`
  - `frontend/src/data/default-applications.yaml`
- Updated `frontend/data/default-applications.ts` so sample YAML text is
  generated from JSON source, preventing future JSON/YAML drift.

**Technical Decisions**:
- Keep edit and detail interactions in side sheets for compact list
  workflows, but move create workflows to dedicated pages for stronger
  orientation and navigation.
- Treat JSON as source of truth for sample import text and derive YAML.

**Standards Applied**:
- Programming: focused route/component changes with no unrelated
  refactors.
- Security: no sensitive data handling changes.
- Testing: validated lint, unit tests, and production build.

**Outcomes**:
- Add Job and Add Application now open as full pages with Back button.
- Candidate display labels are human-readable and consistent.
- Validation passed:
  - `npm run lint`
  - `npm run test -- --run`
  - `npm run build`

**Known Issues/Tech Debt**:
- Existing edit flows still use sheet UI by design; if desired, these can
  also be migrated to route-based edit pages in a later pass.

---

## 2026-04-17 - Frontend controlled redesign Phase 0

**Context**: The existing frontend was rejected for structural issues. The
user requested Phase 0 only: audit the current frontend and propose a
Next.js redesign plan before major coding.

**Actions Taken**:
- Read local agent instructions and existing artifact context.
- Confirmed `.github/copilot-instructions.md`, `.github/instructions/`,
  and `00-project-references/` are unavailable in this checkout.
- Inspected the current Vite, React Router, TypeScript frontend package
  structure, route model, shell, pages, schemas, persistence, fixtures,
  import/export utilities, API client, CSS, and tests.
- Identified which current frontend pieces conflict with the controlled
  redesign requirements.
- Identified reusable domain assets for a Next.js App Router rebuild.
- Prepared a route map, component map, data flow plan, typography plan,
  and phased implementation plan.

**Technical Decisions**:
- Rebuild the frontend on Next.js App Router instead of migrating the
  current Vite shell in place.
- Reuse schema, API, fixture, import/export, and persistence concepts
  where they fit the new app structure.
- Replace the current global CSS approach with shadcn/ui components,
  Tailwind tokens, and Inter through `next/font`.
- Keep tables compact by default and move secondary data to drawers,
  sheets, and detail panels.

**Standards Applied**:
- Programming: read existing files before referencing current functions,
  routes, or modules.
- Security: plan API status surfaces without secret-bearing config.
- Testing: plan coverage for parsing, validation, persistence, API
  status, match errors, and responsive behavior.

**Outcomes**:
- Phase 0 audit and redesign plan are ready for user review.
- No frontend code implementation was started.
- Ready for: user approval to begin Phase 1.

**Known Issues/Tech Debt**:
- The repository has pre-existing modified and untracked files outside
  this Phase 0 artifact update.
- `00-project-references/` and expected `.github` instruction files are
  not present in this checkout, so those standards could not be loaded.

---

## 2026-04-17 - Frontend controlled redesign Phases 1 and 2

**Context**: The user approved implementation of Phase 1 and Phase 2
after the controlled redesign audit. The goal was to replace the Vite
frontend foundation with Next.js App Router and deliver the Jobs
management workflow.

**Actions Taken**:
- Replaced the Vite/React Router frontend with a Next.js App Router
  structure.
- Added Inter typography through `next/font/google`.
- Added Tailwind and local shadcn/ui-style components for cards,
  buttons, badges, inputs, textareas, sheets, tables, and loading
  states.
- Built the responsive console shell with sidebar navigation, mobile
  navigation, header status, workspace provider, and Sonner toasts.
- Implemented Overview with metrics derived from the current workspace
  and API status state.
- Added stable routes for Overview, Jobs, Applications, Import / Export,
  Match Runs, and Settings / API Status.
- Implemented Jobs management with 15 seeded backend-oriented jobs,
  compact TanStack Table columns, mobile summary cards, row selection,
  contextual bulk actions, detail sheet, create/edit form, hide/show,
  archive/delete, defaults restore, JSON/YAML import preview, per-record
  validation issues, and JSON/YAML export.
- Added tests for seeded job validity and job import/export parsing.
- Added `.next` to `.gitignore`.

**Technical Decisions**:
- Kept TanStack Table focused on table mechanics and moved full record
  detail into sheets.
- Kept import validation in a dedicated utility so the Jobs page can
  show parse errors and record-level validation issues clearly.
- Added UI metadata to job records while preserving backend payload
  validation and conversion.
- Used local storage for controlled demo/testing state until later
  phases introduce broader application and match-run workflows.

**Standards Applied**:
- Programming: replaced the mismatched framework foundation instead of
  patching the old scaffold.
- Security: exposed only non-secret API status details.
- Testing: ran frontend build, lint, targeted tests, npm audit, and local
  HTTP checks.

**Outcomes**:
- Phase 1 and Phase 2 are implemented.
- Next.js app responds locally at `http://localhost:5174`.
- Frontend redesign commit pushed: `46b5ae7`.
- Validation passed:
  - `npm run build`
  - `npm run lint`
  - `npm test`
  - `npm audit --audit-level=critical`
  - `curl -I http://127.0.0.1:5174/`
  - `curl -I http://127.0.0.1:5174/jobs`

**Known Issues/Tech Debt**:
- Applications, dedicated Import / Export, and Match Runs remain as
  planned later-phase routes.
- The backend had pre-existing modified files that were not part of this
  frontend commit.

---

## 2026-04-17 - Run script service manager

**Context**: The existing `run.sh` still attempted to start the removed
Vite frontend, required manual connection values, and could not control
backend and frontend independently.

**Actions Taken**:
- Replaced `run.sh` with a target-aware service manager.
- Added safe host/port resolution from shell environment, `.env`,
  `.env.local`, and `.env.example`.
- Added documented `BACKEND_HOST`, `BACKEND_PORT`, `FRONTEND_HOST`, and
  `FRONTEND_PORT` values to `.env.example`.
- Added support for command-first and target-first usage, including
  `./run.sh start backend`, `./run.sh stop frontend`, and
  `./run.sh frontend restart`.
- Switched frontend startup from Vite to Next.js.
- Added separate backend/frontend status, logs, URLs, restart, stop, and
  build behavior.
- Added startup checks that wait for a service port before claiming the
  service is ready.

**Technical Decisions**:
- The script reads only specific non-secret host/port keys from
  environment files.
- The script does not print secret-bearing variables.
- Stale PID files are removed during status/stop checks.

**Standards Applied**:
- Programming: keep script behavior explicit and service-scoped.
- Security: avoid loading or echoing full `.env` contents.
- Testing: validate syntax, help, status, URL resolution, logs, env
  overrides, stale PID cleanup, and frontend build.

**Outcomes**:
- `run.sh` now fits the Next.js frontend and can manage each server
  separately.
- Validated commands:
  - `bash -n run.sh`
  - `./run.sh help`
  - `./run.sh status`
  - `./run.sh urls`
  - `FRONTEND_PORT=5199 ./run.sh urls frontend`
  - `BACKEND_HOST=0.0.0.0 BACKEND_PORT=9001 ./run.sh connect backend`
  - `./run.sh logs frontend`
  - `./run.sh build frontend`

**Known Issues/Tech Debt**:
- In the Codex sandbox, background dev servers can be killed when the
  tool process exits. The script still validates startup and will behave
  normally in a persistent terminal.

---

## 2026-04-17 - Frontend controlled redesign Phases 3 and 4

**Context**: Phase 1 and 2 were complete. The user requested immediate
execution of Phase 3 (Applications UX) and Phase 4 (Match Runs UX).

**Actions Taken**:
- Added seeded application data wiring with 15 valid default records and
  JSON/YAML sample payload text including intentionally invalid samples
  for validation preview paths.
- Extended frontend schemas with candidate payload support, portfolio
  structures, and application normalization/helpers for backend payload
  conversion.
- Extended import/export utilities to support application parse-preview
  validation for both JSON and YAML.
- Extended workspace state with seeded applications and imported
  application counters.
- Replaced Applications placeholder route with a full Applications page:
  compact table, search/filter/sort/pagination, selection and contextual
  bulk actions, detail sheet, create/edit form, JSON/YAML import preview
  flow, and export controls.
- Replaced Match Runs placeholder route with a full Match Runs page:
  job and candidate selection, live backend match execution, structured
  error handling, ranked compact result list, result detail sheet, and
  2-3 candidate side-by-side comparison.
- Added test coverage for application import parsing and validation.

**Technical Decisions**:
- Reused the Jobs interaction pattern for consistency while keeping the
  Applications table limited to key scanning columns.
- Used API-level typed error extraction to keep match run failures
  understandable and non-opaque.
- Implemented comparison as a lightweight optional selection flow on top
  of ranked results rather than a separate route.

**Standards Applied**:
- Programming: implemented changes inside the existing Next.js App
  Router structure and avoided unrelated refactors.
- Security: preserved safe metadata-only status exposure and avoided
  secret-bearing config output.
- Testing: validated new parse logic and ran lint, tests, and build.

**Outcomes**:
- Phase 3 and 4 frontend deliverables are implemented.
- Validation passed:
  - `npm run lint`
  - `npm test`
  - `npm run build`

**Known Issues/Tech Debt**:
- Dedicated Import / Export page remains a separate route that still
  needs full implementation in a later phase.
- Current match execution runs one backend request per selected job using
  the selected candidate set; bulk endpoint orchestration can be added
  later if needed for larger datasets.

---

## 2026-04-17 - Frontend UX refinement pass

**Context**: After live usage feedback, the frontend still had workflow
friction. The user requested full-page import/export, improved selection
UX, better Defaults placement, match selection collapse behavior,
portfolio chip polish, and favicon support.

**Actions Taken**:
- Replaced the placeholder Import / Export route with a full-page client
  workflow supporting jobs and applications JSON/YAML parse-preview-
  validate-confirm imports and direct exports.
- Updated Overview quick action and Jobs/Applications import triggers to
  route to `/import-export`.
- Updated Jobs and Applications tables to move Defaults into table
  controls and added explicit selection helper actions (select page,
  clear page, clear all).
- Updated Match Runs with a collapsible selection workspace and
  auto-collapse when matching starts.
- Added explicit select all and clear controls for jobs and candidate
  subset selection in Match Runs.
- Tightened Applications portfolio badge style to be smaller and
  non-wrapping.
- Added `frontend/app/icon.svg` to provide favicon/app icon support.

**Technical Decisions**:
- Kept import parsing/validation logic centralized in existing utilities
  and reused them in the new full-page route.
- Removed side-sheet import flow usage from Jobs and Applications to
  enforce a single, predictable import path.
- Implemented selection helpers close to table/match controls to make
  multi-select behavior explicit and discoverable.

**Standards Applied**:
- Programming: made focused route/component updates without broad
  architectural refactors.
- Security: preserved local browser data handling and avoided exposing
  any sensitive runtime configuration.
- Testing: validated lint, unit tests, and production build.

**Outcomes**:
- Import / Export is no longer blank and is now a dedicated full-page
  workflow.
- Jobs and Applications no longer use right-side import sheets.
- Match Runs selection is collapsible and auto-collapses on run.
- Portfolio chips avoid wrapping artifacts.
- Favicon is present via Next.js app icon route.
- Validation passed:
  - `npm run lint`
  - `npm run test -- --run`
  - `npm run build`

**Known Issues/Tech Debt**:
- Selection helper controls improve discoverability, but keyboard-driven
  range selection is still not implemented.

---
