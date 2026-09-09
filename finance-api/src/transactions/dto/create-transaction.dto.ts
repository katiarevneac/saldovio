import { IsIn, IsInt, IsNumber, Matches, IsOptional, IsString } from 'class-validator';

export class CreateTransactionDto {
  @IsInt()
  accountId!: number;

  @IsIn(['income', 'expense', 'transfer'])
  type!: 'income' | 'expense' | 'transfer';

  @IsNumber()
  amount!: number;

  // Date-only, not @IsDateString() (ISO8601) — that also accepts full
  // timestamps like "2026-09-10T12:00:00Z", which fromDateOnlyString()
  // can't handle and previously fell through to an unhandled 500.
  // Matches() rejects that shape here, at the DTO layer, before it
  // reaches the service.
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'occurredOn must be in YYYY-MM-DD format' })
  occurredOn!: string;

  @IsOptional()
  @IsString()
  category?: string;
}
