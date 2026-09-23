// Runs before every test file. Loads .env.test (not the ambient .env, which
// points at saldovio_dev — the same database used for manual testing) and
// refuses to let tests proceed against anything other than a database whose
// name ends in `_test`.
//
// This exists because vitest previously resolved DATABASE_URL through
// PrismaService's own `import 'dotenv/config'`, which loads .env and would
// happily point every test run at saldovio_dev. A name-suffix check alone is
// not real isolation (a same-named "_test" database on a shared/production
// host would still pass it), but it is the floor: it stops the common
// accident of `npm test` writing into real development data.
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';

loadDotenv({ path: resolve(import.meta.dirname, '../.env.test'), override: true });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set for tests. Copy finance-api/.env.test.example to ' +
      'finance-api/.env.test, point it at a database named *_test, and re-run.',
  );
}

let databaseName: string;
try {
  databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
} catch {
  throw new Error(`DATABASE_URL is not a valid connection URL: ${databaseUrl}`);
}

if (!databaseName.endsWith('_test')) {
  throw new Error(
    `Refusing to run tests against database "${databaseName}" — its name does not end ` +
      'in "_test". Tests must never run against saldovio_dev or any other non-test ' +
      'database. Point DATABASE_URL (finance-api/.env.test) at a *_test database.',
  );
}
