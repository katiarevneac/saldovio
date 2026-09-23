// S00.4: deterministic fixture data for the test database — fixed users
// A/B with fixed accounts, transactions, and a recurring rule each, all
// on hardcoded dates (never `new Date()`), so a test asserting against
// this data gets the same result every run regardless of when it runs.
// Never requires a pre-existing personal user.
//
// Run: npm run db:seed:test (finance-api). Idempotent — deletes any prior
// run's rows for these two fixed emails before recreating them, so it can
// be re-run against the same test DB without accumulating duplicates.
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import bcrypt from 'bcryptjs';
import { assertDatabaseUrlSuffix } from './db-guard.ts';

loadDotenv({ path: resolve(import.meta.dirname, '../.env.test'), override: true });
const databaseUrl = assertDatabaseUrlSuffix(process.env.DATABASE_URL, '_test');

const { PrismaClient } = await import('../src/generated/prisma/client.js');
const { PrismaPg } = await import('@prisma/adapter-pg');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const SEED_PASSWORD = 'SeedPassword123!';

const FIXTURES = [
  {
    email: 'seed-user-a@saldovio.test',
    account: { name: 'Checking', currentBalance: '1000.00', referenceDate: '2026-01-01' },
    transactions: [
      { type: 'income', amount: '500.00', occurredOn: '2026-01-05', category: 'Salary' },
      { type: 'expense', amount: '-120.50', occurredOn: '2026-01-10', category: 'Groceries' },
    ],
    recurringRule: { type: 'expense', amount: '300.00', dayOfMonth: 20, category: 'Rent' },
  },
  {
    email: 'seed-user-b@saldovio.test',
    account: { name: 'Checking', currentBalance: '2500.00', referenceDate: '2026-01-01' },
    transactions: [
      { type: 'expense', amount: '-75.25', occurredOn: '2026-01-03', category: 'Utilities' },
      { type: 'income', amount: '1200.00', occurredOn: '2026-01-15', category: 'Freelance' },
    ],
    recurringRule: { type: 'income', amount: '3000.00', dayOfMonth: 1, category: 'Salary' },
  },
] as const;

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  for (const fixture of FIXTURES) {
    // FK-safe delete order, same as UsersService.deleteAccount — a
    // re-run must never leave orphaned rows from a prior seed.
    await prisma.recurringRule.deleteMany({ where: { account: { user: { email: fixture.email } } } });
    await prisma.transaction.deleteMany({ where: { account: { user: { email: fixture.email } } } });
    await prisma.account.deleteMany({ where: { user: { email: fixture.email } } });
    await prisma.user.deleteMany({ where: { email: fixture.email } });

    const user = await prisma.user.create({
      data: { email: fixture.email, passwordHash },
    });

    const account = await prisma.account.create({
      data: {
        name: fixture.account.name,
        currentBalance: fixture.account.currentBalance,
        referenceDate: new Date(`${fixture.account.referenceDate}T00:00:00.000Z`),
        userId: user.id,
      },
    });

    for (const tx of fixture.transactions) {
      await prisma.transaction.create({
        data: {
          accountId: account.id,
          type: tx.type,
          amount: tx.amount,
          occurredOn: new Date(`${tx.occurredOn}T00:00:00.000Z`),
          category: tx.category,
        },
      });
    }

    await prisma.recurringRule.create({
      data: {
        accountId: account.id,
        type: fixture.recurringRule.type,
        amount: fixture.recurringRule.amount,
        dayOfMonth: fixture.recurringRule.dayOfMonth,
        category: fixture.recurringRule.category,
      },
    });

    console.log(`Seeded ${fixture.email} (user ${user.id}, account ${account.id})`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
