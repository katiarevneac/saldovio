import { IsDateString, IsNumber, IsString, MinLength } from 'class-validator';

export class CreateAccountDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsNumber()
  currentBalance!: number;

  @IsDateString()
  referenceDate!: string;
}
