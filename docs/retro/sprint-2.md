# Sprint 2 Retrospective — Saldovio

**Sprint:** 2 weeks (extended from Sprint 1's 1-week cadence because scope tripled), closed early on 2026-09-08.
**Goal:** A real transaction can be created from the dashboard form, through the Finance API, into PostgreSQL — replacing the fake in-memory data path.
**Result:** All three stories (S1: schema, S2: POST endpoint, S3: dashboard form + GET endpoint) shipped and merged, in a single continuous session, well inside the 2-week window.

## Estimate vs. actual

Same gap as Sprint 1's retro flagged and it wasn't fixed: no per-story time estimate was set before starting S1, S2, or S3. The sprint length (2 weeks) was chosen as a risk buffer for unfamiliar tools, not derived from an estimate of the actual work. Everything finished in one session again, so — same as last time — "finished early" can't be distinguished from "overestimated," because there's still nothing to compare against. This is now a repeated pattern, not a one-off.

## What actually took a mid-flight process correction

Not scope cut this time — a **process gap caught partway through and corrected in-flight**: S1 and S2 were committed directly to `main`, skipping the branch → PR → merge flow that Sprint 1 (SAL-3) had established. It wasn't caught until after both were already merged — too late to undo without rewriting shared history, so it was left as-is and flagged. S3 went back to branch + PR. Worth naming plainly: a workflow rule that gets skipped once and not immediately corrected tends to stay skipped; the fix here was explicit re-confirmation before continuing, not assuming the old habit would resume on its own.

## Scope held deliberately

`accountId` is hardcoded to `1` in the dashboard form — there is no account-selection or account-creation UI yet. This was the right call for this sprint: multi-account support wasn't in S1–S3's acceptance criteria, and building it now would have meant designing account creation/selection UI against a data model (`accounts` table) that itself hasn't been exercised by any real user flow yet. Revisit when a story explicitly calls for it.

## Note on this document

Written by Claude, not the user, at the user's request — same as Sprint 1's retro. The gap this creates (see brief §14: PO/EM judgment is meant to be exercised, not delegated) has now repeated across two sprints in a row.
