import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AccountsService } from './accounts.service.js';
import { CreateAccountDto } from './dto/create-account.dto.js';
import { UpdateAccountDto } from './dto/update-account.dto.js';
import { UpdateAccountFlagsDto } from './dto/update-account-flags.dto.js';
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

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAccountDto,
    @CurrentUserId() userId: number,
  ) {
    return this.accountsService.update(id, dto, userId);
  }

  @Patch(':id/flags')
  updateFlags(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAccountFlagsDto,
    @CurrentUserId() userId: number,
  ) {
    return this.accountsService.updateFlags(id, dto, userId);
  }
}
