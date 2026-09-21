import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TransactionsService } from './transactions.service.js';
import { CreateTransactionDto } from './dto/create-transaction.dto.js';
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

  @Post()
  create(@Body() dto: CreateTransactionDto, @CurrentUserId() userId: number) {
    return this.transactionsService.create(dto, userId);
  }

  @Get()
  findAll(@CurrentUserId() userId: number) {
    return this.transactionsService.findAll(userId);
  }

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

  @Post('import/commit')
  commitImport(@Body() dto: ImportCommitDto, @CurrentUserId() userId: number) {
    return this.transactionsService.commitImport(dto.accountId, dto.rows, userId);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="transactions.csv"')
  exportCsv(@CurrentUserId() userId: number) {
    return this.transactionsService.exportCsv(userId);
  }
}
