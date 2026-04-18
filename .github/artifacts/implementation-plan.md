# Implementation Plan

## Session: Match row full-page detail route
Date: 2026-04-17

## Context
Match Runs row-click still opened a right-side detail sheet. The desired
behavior is a full-page detail route, consistent with the existing Add
page flow.

## Technical Approach

### Architecture Decisions
- Route result row clicks to a dedicated dynamic page.
- Pass selected result detail through URL query payload for immediate
  route rendering without introducing new global store shape.

### Implementation Steps
1. Update Match Runs row click handler to push dynamic detail route.
2. Remove side-sheet detail UI from Match Runs page.
3. Add route page `/match-runs/[jobId]/[candidateId]`.
4. Add a route-backed detail page client with Back button and full result
  view.
5. Run frontend lint and production build.

### Standards Applied
- Programming: focused frontend route/navigation change with no unrelated
  refactors.
- Security: no secret or auth flow changes.
- Testing: frontend lint and production build.

### Files to Create/Modify
- `frontend/components/match-runs/match-runs-page-client.tsx` - route row clicks and remove detail sheet
- `frontend/components/match-runs/match-result-page-client.tsx` - full-page result details
- `frontend/app/(console)/match-runs/[jobId]/[candidateId]/page.tsx` - dynamic route wiring
- `.github/artifacts/*` - required session tracking

---
Last Updated: 2026-04-17
