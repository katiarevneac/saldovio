import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';
import { InternalAuthGuard } from '../auth/internal-auth.guard.js';
import { CurrentUserId } from '../auth/current-user-id.decorator.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
}
