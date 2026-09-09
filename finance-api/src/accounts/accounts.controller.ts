import { Controller, Get, UseGuards } from '@nestjs/common';
import { AccountsService } from './accounts.service.js';
import { InternalAuthGuard } from '../auth/internal-auth.guard.js';
import { CurrentUserId } from '../auth/current-user-id.decorator.js';

@UseGuards(InternalAuthGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get('me')
  findMine(@CurrentUserId() userId: number) {
    return this.accountsService.findMine(userId);
  }
}
