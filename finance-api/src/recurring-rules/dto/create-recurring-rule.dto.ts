import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateRecurringRuleDto {
  @IsInt()
  accountId!: number;

  @IsIn(['income', 'expense'])
  type!: 'income' | 'expense';

  // Stored as a positive magnitude, not a signed amount like
  // transactions — the forecast formula (CLAUDE.md "sold estimat")
  // adds income and subtracts expense explicitly by `type`, so the
  // sign lives in the formula, not the stored value.
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth!: number;

  @IsOptional()
  @IsString()
  category?: string;
}
