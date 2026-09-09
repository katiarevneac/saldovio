import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { TransactionsModule } from './transactions/transactions.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AccountsModule } from './accounts/accounts.module.js';
import { RecurringRulesModule } from './recurring-rules/recurring-rules.module.js';

@Module({
  imports: [
    PrismaModule,
    TransactionsModule,
    UsersModule,
    AuthModule,
    AccountsModule,
    RecurringRulesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
