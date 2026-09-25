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
