import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateRecurringRuleDto {
  @IsInt()
  accountId!: number;

  @IsIn(['income', 'expense'])
  type!: 'income' | 'expense';

  @IsNumber()
  amount!: number;

  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth!: number;

  @IsOptional()
  @IsString()
  category?: string;
}
