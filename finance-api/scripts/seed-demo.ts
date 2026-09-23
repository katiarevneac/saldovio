// S00.10: a synthetic demo seed, isolated from both test and real-user
// data — a distinct database (`*_demo`, never `_test` or `_dev`), fixed
// dates (not wall-clock-relative, so the forecast/simulator show sensible
// numbers regardless of when the demo is run), and data that is obviously
// synthetic (email/name), never a real person's information.
//
// Run: npm run db:seed:demo (finance-api). Idempotent — deletes any prior
// run's rows for the fixed demo email before recreating them.
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import bcrypt from 'bcryptjs';
import { assertDatabaseUrlSuffix } from './db-guard.ts';

loadDotenv({ path: resolve(import.meta.dirname, '../.env.demo'), override: true });
const databaseUrl = assertDatabaseUrlSuffix(process.env.DATABASE_URL, '_demo');

const { PrismaClient } = await import('../src/generated/prisma/client.js');
const { PrismaPg } = await import('@prisma/adapter-pg');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const DEMO_EMAIL = 'demo@saldovio.test';
const DEMO_PASSWORD = 'DemoPassword123!';

const ACCOUNT = { name: 'Checking', currentBalance: '3200.00', referenceDate: '2026-01-01' };

const TRANSACTIONS = [
  { type: 'income', amount: '4500.00', occurredOn: '2026-01-01', category: 'Salary' },
  { type: 'expense', amount: '-1200.00', occurredOn: '2026-01-02', category: 'Rent' },
  { type: 'expense', amount: '-320.50', occurredOn: '2026-01-05', category: 'Groceries' },
  { type: 'expense', amount: '-89.99', occurredOn: '2026-01-08', category: 'Utilities' },
  { type: 'expense', amount: '-150.00', occurredOn: '2026-01-12', category: 'Transport' },
  { type: 'income', amount: '600.00', occurredOn: '2026-01-14', category: 'Freelance' },
  { type: 'expense', amount: '-75.20', occurredOn: '2026-01-18', category: 'Entertainment' },
] as const;

const RECURRING_RULES = [
  { type: 'income', amount: '4500.00', dayOfMonth: 1, category: 'Salary' },
  { type: 'expense', amount: '1200.00', dayOfMonth: 2, category: 'Rent' },
  { type: 'expense', amount: '250.00', dayOfMonth: 15, category: 'Groceries' },
] as const;

async function main() {
  await prisma.recurringRule.deleteMany({ where: { account: { user: { email: DEMO_EMAIL } } } });
  await prisma.transaction.deleteMany({ where: { account: { user: { email: DEMO_EMAIL } } } });
  await prisma.account.deleteMany({ where: { user: { email: DEMO_EMAIL } } });
  await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const user = await prisma.user.create({ data: { email: DEMO_EMAIL, passwordHash, horizonDays: 30 } });

  const account = await prisma.account.create({
    data: {
      name: ACCOUNT.name,
      currentBalance: ACCOUNT.currentBalance,
      referenceDate: new Date(`${ACCOUNT.referenceDate}T00:00:00.000Z`),
      userId: user.id,
    },
  });

  for (const tx of TRANSACTIONS) {
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

  for (const rule of RECURRING_RULES) {
    await prisma.recurringRule.create({
      data: {
        accountId: account.id,
        type: rule.type,
        amount: rule.amount,
        dayOfMonth: rule.dayOfMonth,
        category: rule.category,
      },
    });
  }

  console.log(`Seeded demo user ${DEMO_EMAIL} (user ${user.id}, account ${account.id})`);
  console.log(`Demo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
