import { IsString, IsOptional, Min } from 'class-validator';

export class UpdateUserProfileDto {
  @IsString()
  @Min(3)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  allergies?: string[];
}
