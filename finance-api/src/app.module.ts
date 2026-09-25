import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ClockModule } from './common/clock.module.js';
import { TransactionsModule } from './transactions/transactions.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AccountsModule } from './accounts/accounts.module.js';
import { RecurringRulesModule } from './recurring-rules/recurring-rules.module.js';

@Module({
  imports: [
    // In-memory storage (the default — no external store configured).
    // Every service is single-instance on free-tier hosting (Epic 12
    // S3, not yet deployed); revisit if a second instance ever exists
    // (improvements.md S04.4's "durable/shared limits for multiple
    // instances" note — not applicable to this deployment shape today).
    //
    // Known limitation, accepted not fixed (Epic 15 Story 1 final
    // review): ThrottlerGuard's default tracking key is req.ip. Under
    // this app's BFF architecture, the browser never calls finance-api
    // directly — only web/ does, server-to-server — so req.ip is always
    // web/'s own server IP for every request from every user. In
    // practice this makes every limit below (login, signup, transaction
    // create, import routes) one global bucket shared across all users,
    // not a per-user/per-caller limit. Fixing this properly needs a
    // per-caller tracking key (e.g. derived from the internal-auth JWT's
    // subject) threaded through a custom ThrottlerGuard — deferred as
    // out of scope for this story; documented per the design spec's
    // "document the assumption" requirement rather than left implicit.
    // See docs/local-development.md for the same note aimed at a human
    // reader.
    ThrottlerModule.forRoot([{ ttl: seconds(60), limit: 100 }]),
    PrismaModule,
    ClockModule,
    TransactionsModule,
    UsersModule,
    AuthModule,
    AccountsModule,
    RecurringRulesModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
