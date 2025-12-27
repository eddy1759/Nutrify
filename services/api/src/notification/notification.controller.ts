import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { AtGuard } from '../auth/guard/at.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { IsString, IsNotEmpty } from 'class-validator';

class RegisterTokenDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}

@Controller('notifications')
@UseGuards(AtGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async getHistory(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: string,
  ) {
    const take = limit ? parseInt(limit) : 20;
    return this.notificationService.getUserNotifications(userId, take);
  }

  @Post('register-token')
  async registerPushToken(
    @CurrentUser('id') userId: string,
    @Body() dto: RegisterTokenDto,
  ) {
    try {
      return await this.notificationService.savePushToken(userId, dto.token);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_error) {
      throw new BadRequestException('Invalid Push Token');
    }
  }
}
