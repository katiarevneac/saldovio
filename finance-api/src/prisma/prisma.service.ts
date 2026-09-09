import 'dotenv/config';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

// DATABASE_URL is normally loaded once, at process start, by main.ts's
// own top-level `import 'dotenv/config'`. That's sufficient when Nest
// boots the whole app, but PrismaService is also instantiated directly
// in its own spec (and will be in every later service test, Tasks
// 3-7) without main.ts ever running — dotenv.config() is idempotent,
// so loading it again here just guarantees PrismaService never depends
// on an entry point it can't see.

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL is not set — refusing to fall back to pg's implicit local connection defaults, which could silently connect to the wrong database.",
      );
    }
    const adapter = new PrismaPg({ connectionString: databaseUrl });
    super({ adapter });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
