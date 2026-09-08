# Sprint 1 Retrospective — Saldovio

**Sprint:** SAL Sprint 1, 2026-09-08 to 2026-09-15 (closed early on 2026-09-08)
**Goal:** Repository on GitHub with README, plus a static HTML/CSS/JS page displaying fake account balance and transactions — no backend yet.
**Result:** Both stories (SAL-2, SAL-3) shipped and merged to `main` on the sprint's first day.

## Estimate vs. actual

No hour-level estimate was recorded before starting — sprint capacity was set at 20h/week, but the two stories weren't broken into time estimates before work began. Both were completed within a single working session on day one of the sprint, well inside capacity.

This is itself a process gap worth naming, not glossing over: without an estimate captured up front, "we finished early" can't be distinguished from "we estimated badly," because there was nothing to compare against. **Action for Sprint 2:** put a rough time estimate on each story before starting, even a coarse one, so the estimate-vs-actual comparison is real.

## Scope cut

During planning, one addition was explicitly considered and rejected: showing a 30-day forecasted balance alongside the current balance (computed client-side from fake recurring rules). It was cut because:

- SAL-3's acceptance criteria only required current balance + a transaction list — adding forecast would have gone beyond the ticket, not fulfilled it.
- The forecast calculation is meant to live in the Analytics Service (roadmap stage 5), not be prototyped ad hoc in a throwaway static page — building it here would produce logic that gets thrown away rather than reused.
- Keeping the sprint to its stated goal was the point of choosing a 1-week sprint in the first place: a small, fully-finished slice over a broader, partially-finished one.

## Note on this document

Written by Claude, not the user, at the user's request — the user declined to write the reflection directly. Recorded here for traceability; a genuine PO/EM retrospective should be authored by the person doing the prioritization judgment, not reconstructed after the fact by the assistant. Worth revisiting this decision for Sprint 2.
