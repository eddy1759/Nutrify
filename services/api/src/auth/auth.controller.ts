import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AtGuard } from './guard/at.guard';
import { RtGuard } from './guard/rt.guard';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  VerifyAccountDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtPayloadWithRt } from './types/auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() data: RegisterDto) {
    return this.authService.register(data);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body() data: VerifyAccountDto) {
    return this.authService.verifyAccount(data);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() data: LoginDto) {
    return this.authService.login(data);
  }

  @Post('logout')
  @UseGuards(AtGuard)
  @HttpCode(HttpStatus.OK)
  logout(@CurrentUser('id') userId: string) {
    return this.authService.logout(userId);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() body: any) {
    return this.authService.forgotPassword(body.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() data: ResetPasswordDto) {
    return this.authService.resetPassword(data);
  }

  @Post('refresh')
  @UseGuards(RtGuard)
  @HttpCode(HttpStatus.OK)
  refreshTokens(@CurrentUser() user: JwtPayloadWithRt) {
    return this.authService.refreshTokens(user.sub, user.refreshToken);
  }
}
