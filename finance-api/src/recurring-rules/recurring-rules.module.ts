import { Module } from '@nestjs/common';
import { RecurringRulesController } from './recurring-rules.controller.js';
import { RecurringRulesService } from './recurring-rules.service.js';

@Module({
  controllers: [RecurringRulesController],
  providers: [RecurringRulesService],
})
export class RecurringRulesModule {}
