import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AccountsService } from './accounts.service.js';
import { CreateAccountDto } from './dto/create-account.dto.js';
import { InternalAuthGuard } from '../auth/internal-auth.guard.js';
import { CurrentUserId } from '../auth/current-user-id.decorator.js';

@UseGuards(InternalAuthGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  create(@Body() dto: CreateAccountDto, @CurrentUserId() userId: number) {
    return this.accountsService.create(dto, userId);
  }

  @Get('me')
  findMine(@CurrentUserId() userId: number) {
    return this.accountsService.findMine(userId);
  }
}
