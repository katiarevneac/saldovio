import { IsNumber, IsString, Matches, MinLength } from 'class-validator';

export class CreateAccountDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsNumber()
  currentBalance!: number;

  // Date-only, not @IsDateString() (ISO8601) — see the same note on
  // CreateTransactionDto.occurredOn: ISO8601 also accepts full
  // timestamps, which fromDateOnlyString() can't handle and previously
  // fell through to an unhandled 500 instead of a clean 400.
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'referenceDate must be in YYYY-MM-DD format' })
  referenceDate!: string;
}
