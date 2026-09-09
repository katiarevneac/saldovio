import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { RecurringRulesService } from './recurring-rules.service.js';
import { CreateRecurringRuleDto } from './dto/create-recurring-rule.dto.js';
import { InternalAuthGuard } from '../auth/internal-auth.guard.js';
import { CurrentUserId } from '../auth/current-user-id.decorator.js';

@UseGuards(InternalAuthGuard)
@Controller('recurring-rules')
export class RecurringRulesController {
  constructor(private readonly recurringRulesService: RecurringRulesService) {}

  @Post()
  create(@Body() dto: CreateRecurringRuleDto, @CurrentUserId() userId: number) {
    return this.recurringRulesService.create(dto, userId);
  }

  @Get()
  findAll(@CurrentUserId() userId: number) {
    return this.recurringRulesService.findAll(userId);
  }
}
