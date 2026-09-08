import { IsIn, IsInt, IsNumber, IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateTransactionDto {
  @IsInt()
  accountId!: number;

  @IsIn(['income', 'expense', 'transfer'])
  type!: 'income' | 'expense' | 'transfer';

  @IsNumber()
  amount!: number;

  @IsDateString()
  occurredOn!: string;

  @IsOptional()
  @IsString()
  category?: string;
}
