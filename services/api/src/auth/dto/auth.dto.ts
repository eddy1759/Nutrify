import {
  IsString,
  IsEmail,
  IsAlphanumeric,
  Min,
  IsNotEmpty,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @Min(3)
  name!: string;

  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsAlphanumeric()
  @Min(8)
  password!: string;
}

export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsAlphanumeric()
  @Min(8)
  password!: string;
}

export class verifyAccountDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @Min(6)
  otp!: string;
}

export class ResetPasswordDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @Min(6)
  otp!: string;

  @IsString()
  @IsAlphanumeric()
  @Min(8)
  newPassword!: string;
}
