# Saldovio

Personal finance decision assistant — a SaaS being built incrementally, in the open, as both a real product and a structured software-engineering learning project (architecture, databases, testing, Git workflow, Agile/Scrum with Jira).

## The problem

Someone with a monthly income and recurring expenses wants to know their estimated balance over the next 30 days, and the impact of a purchase decision, using visible assumptions and verifiable calculations — not a black-box "financial health score."

## Status

Early scaffolding. No application code yet. Currently building the first deliverable: a static page with fake data to validate the dashboard concept before any backend exists.

## Planned architecture

Three independently deployable components:

| Component | Responsibility | Stack |
| --- | --- | --- |
| Web | Pages, dashboard, forms, charts | React + Next.js + TypeScript |
| Finance API | Accounts, transactions, auth, validation | NestJS + TypeScript |
| Analytics Service | Forecast and scenario calculations | Python + FastAPI |
| Data | Persistence and integrity | PostgreSQL |

Full rationale and decision history: `Saldovio-Project-Brief.md`. Working rules for contributors (human or AI): `CLAUDE.md`.

## Roadmap

Static fake-data page → first transaction through Web+API+DB → per-user auth → correct dashboard → 30-day forecast (Analytics Service) → purchase simulator → CSV import → demo/CI/CD → invited beta.

## License

Not yet decided.
