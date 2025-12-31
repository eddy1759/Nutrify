import { IsNumber, Min, Max, IsOptional, IsString } from 'class-validator';

export class LogWaterDto {
  @IsNumber()
  @Min(1)
  @Max(5000)
  amount: number;
}

export class LogWeightDto {
  @IsNumber()
  @Min(20)
  @Max(500)
  weight: number;

  @IsString()
  @IsOptional()
  date?: string;
}
