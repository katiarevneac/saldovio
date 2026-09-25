# Database role separation (deploy-time, not yet enforced)

Local development uses one Postgres role (the machine's own superuser,
via Postgres.app) for every database and every operation — migrations
and runtime queries alike. This is fine locally; it is not the target
shape for a deployed environment.

**Target, once Epic 12 S3 actually deploys to Neon:** a runtime role
scoped to `SELECT`/`INSERT`/`UPDATE`/`DELETE` on `finance-api`'s own
tables only, separate from a migration role with `CREATE`/`ALTER`
privileges used only by `npx prisma migrate deploy`. `DATABASE_URL` in
Render's environment would use the runtime role; a separate
`MIGRATION_DATABASE_URL`, used only in the pre-deploy migration step,
would use the migration role.

**Known gap, not fixed here:** whether Neon's free tier supports
creating more than one role per project is unconfirmed — this needs
checking against Neon's current docs when Epic 12 S3 actually executes,
not assumed now. If the free tier only supports one role, the honest
fallback is documenting that limitation in `docs/deploy.md` rather than
claiming role separation that doesn't exist.
