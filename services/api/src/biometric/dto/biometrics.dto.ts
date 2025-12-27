import { IsEnum, IsNumber, IsDateString, Min, Max } from 'class-validator';

export enum ActivityLevel {
  SEDENTARY = 'sedentary',
  LIGHTLY_ACTIVE = 'lightly_active',
  MODERATELY_ACTIVE = 'moderately_active',
  VERY_ACTIVE = 'very_active',
  EXTREMELY_ACTIVE = 'extremely_active',
}

export enum Goal {
  CUT = 'cut',
  MAINTAIN = 'maintain',
  BULK = 'bulk',
}

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
}

export class CreateProfileDto {
  @IsEnum(Gender)
  gender: Gender;

  @IsDateString()
  dateOfBirth: string;

  @IsNumber()
  @Min(50)
  @Max(300)
  heightCm: number;

  @IsNumber()
  @Min(20)
  @Max(500)
  currentWeight: number;

  @IsEnum(ActivityLevel)
  activityLevel: ActivityLevel;

  @IsEnum(Goal)
  goal: Goal;
}

export class UpdateProfileDto extends CreateProfileDto {}
