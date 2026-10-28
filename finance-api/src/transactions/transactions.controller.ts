import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, seconds } from '@nestjs/throttler';
import { TransactionsService } from './transactions.service.js';
import { CreateTransactionDto } from './dto/create-transaction.dto.js';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto.js';
import { CreateTransferDto } from './dto/create-transfer.dto.js';
import { UpdateTransactionDto } from './dto/update-transaction.dto.js';
import { ImpactPreviewQueryDto } from './dto/impact-preview-query.dto.js';
import { UpdateVersionDto } from './dto/update-version.dto.js';
import { ImportPreviewDto } from './dto/import-preview.dto.js';
import { ImportCommitDto } from './dto/import-commit.dto.js';
import { InternalAuthGuard } from '../auth/internal-auth.guard.js';
import { CurrentUserId } from '../auth/current-user-id.decorator.js';

// Generous for a personal-account statement export; the real ceiling
// against a runaway file is revolut-parser.ts's 5000-data-row cap,
// this is just a defensive limit on raw upload size.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

@UseGuards(InternalAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @Post()
  create(@Body() dto: CreateTransactionDto, @CurrentUserId() userId: number) {
    return this.transactionsService.create(dto, userId);
  }

  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @Post('transfer')
  createTransfer(@Body() dto: CreateTransferDto, @CurrentUserId() userId: number) {
    return this.transactionsService.createTransfer(dto, userId);
  }

  @Get()
  findAll(@CurrentUserId() userId: number, @Query() query: ListTransactionsQueryDto) {
    return this.transactionsService.findAll(userId, query.includeVoided === 'true');
  }

  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @Post('import/preview')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  previewImport(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: ImportPreviewDto,
    @CurrentUserId() userId: number,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.transactionsService.previewImport(dto.accountId, file.buffer, userId);
  }

  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @Post('import/commit')
  commitImport(@Body() dto: ImportCommitDto, @CurrentUserId() userId: number) {
    return this.transactionsService.commitImport(dto.accountId, dto.rows, userId);
  }

  @Get(':id/impact-preview')
  impactPreview(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ImpactPreviewQueryDto,
    @CurrentUserId() userId: number,
  ) {
    return this.transactionsService.impactPreview(id, query, userId);
  }

  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTransactionDto,
    @CurrentUserId() userId: number,
  ) {
    return this.transactionsService.update(id, dto, userId);
  }

  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @Post(':id/void')
  voidTransaction(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVersionDto,
    @CurrentUserId() userId: number,
  ) {
    return this.transactionsService.void(id, dto, userId);
  }

  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @Post(':id/restore')
  restoreTransaction(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVersionDto,
    @CurrentUserId() userId: number,
  ) {
    return this.transactionsService.restore(id, dto, userId);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="transactions.csv"')
  exportCsv(@CurrentUserId() userId: number) {
    return this.transactionsService.exportCsv(userId);
  }
}
