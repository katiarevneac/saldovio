# Sprint 3 Retrospective — Saldovio

**Sprint:** 2 weeks, same cadence as Sprint 2, closed early on 2026-09-09.
**Goal:** Epic 3 — migrate the dashboard to Next.js, add login/signup with Auth.js, and make Finance API actually enforce per-user ownership (no more fully public dev-mode API).
**Result:** All four stories (S1: Next.js dashboard migration, S2: transaction form, S3: Auth.js login/signup, S4: ownership enforcement) shipped and merged, in a single continuous working session, well inside the 2-week window.

## Estimate vs. actual

Same gap flagged in Sprint 1's and Sprint 2's retros, still not addressed: no per-story time estimate was set before starting S1–S4. This is the third sprint in a row where "finished early" can't be distinguished from "overestimated," because there's still nothing recorded to compare against. Worth deciding explicitly whether this practice matters enough to start, or whether it's a deliberate choice for a solo learning project — right now it's neither, it's just unaddressed.

## Process held this time

Sprint 2's retro flagged a mid-sprint process gap (S1/S2 committed straight to `main`, skipping branch → PR → merge). That didn't recur here — all four stories in this sprint went through branch → PR → merge without exception, including S4, the largest and most security-sensitive story of the project so far. The corrective habit from Sprint 2 held under more pressure, not less.

## A real architecture decision, made and reasoned through

S4 required picking a trust mechanism between web/ and Finance API: a static shared secret plus a client-supplied `X-User-Id` header, versus a short-lived signed JWT with the user id inside the signed payload. This wasn't a rubber-stamp choice — the tradeoff (permanent impersonation risk on secret leak vs. a ~30-second exposure window) was reasoned through and the stronger option was picked deliberately, then correctly re-explained afterward (with one self-correction along the way, initially attributing the risk to browser-side storage that doesn't actually exist here). This is the first sprint where a security architecture decision was made with real understanding of the tradeoff, not just accepted on authority.

## Scope grown transparently, not silently

S4's Jira story only said "enforce per-user ownership." Partway into planning it, a hard dependency surfaced: a newly signed-up user has no account to own, so ownership enforcement alone would leave new users unable to do anything. Rather than quietly expanding the story, this was named explicitly before writing code (atomic user+account creation, folded into S4) and reasoned about as a dependency, not a nice-to-have. Worth naming as the right instinct — scope additions are fine when they're necessary and stated, and become a problem only when they're silent.

## Scope held deliberately

The user who signed up during S3 testing (before S4's atomic-account-creation existed) still has no account, and wasn't retroactively fixed. This is correct: it's dev/test data, not real user data, and "fix it live in prod" is a bad habit to practice even in a learning project. It's now documented (`CLAUDE.md` progress log) as a known, accepted gap rather than a silent inconsistency.

## Note on this document

Written by Claude, not the user, at the user's request — same as Sprints 1 and 2. Third sprint in a row with this same gap (brief §14: PO/EM judgment is meant to be exercised, not delegated). Worth treating as a pattern to decide about explicitly, not just repeat.
