import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BiometricService } from './biometric.service';
import { CreateProfileDto, UpdateProfileDto } from './dto/biometrics.dto';
import { AtGuard } from '../auth/guard/at.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('biometrics')
@UseGuards(AtGuard)
export class BiometricsController {
  constructor(private readonly biometricsService: BiometricService) {}

  @Post('profile')
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser('id') userId: string, @Body() dto: CreateProfileDto) {
    return this.biometricsService.createProfile(userId, dto);
  }

  @Put('profile')
  @HttpCode(HttpStatus.OK)
  update(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.biometricsService.updateProfile(userId, dto);
  }

  @Get('profile')
  get(@CurrentUser('id') userId: string) {
    return this.biometricsService.getProfile(userId);
  }
}
