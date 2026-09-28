import { Body, Controller, Delete, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle, seconds } from '@nestjs/throttler';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';
import { DeleteAccountDto } from './dto/delete-account.dto.js';
import { InternalAuthGuard } from '../auth/internal-auth.guard.js';
import { CurrentUserId } from '../auth/current-user-id.decorator.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @UseGuards(InternalAuthGuard)
  @Get('me/settings')
  getSettings(@CurrentUserId() userId: number) {
    return this.usersService.getSettings(userId);
  }

  @UseGuards(InternalAuthGuard)
  @Patch('me/settings')
  updateSettings(@Body() dto: UpdateSettingsDto, @CurrentUserId() userId: number) {
    return this.usersService.updateSettings(userId, dto);
  }

  @UseGuards(InternalAuthGuard)
  @SkipThrottle()
  @Get('me/session-version')
  getSessionVersion(@CurrentUserId() userId: number) {
    return this.usersService.getSessionVersion(userId);
  }

  @UseGuards(InternalAuthGuard)
  @Post('me/sign-out-all-devices')
  @HttpCode(204)
  signOutAllDevices(@CurrentUserId() userId: number) {
    return this.usersService.bumpSessionVersion(userId);
  }

  @UseGuards(InternalAuthGuard)
  @Delete('me')
  @HttpCode(204)
  deleteAccount(@Body() dto: DeleteAccountDto, @CurrentUserId() userId: number) {
    return this.usersService.deleteAccount(userId, dto.password);
  }
}
