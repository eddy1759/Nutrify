import {
  Controller,
  Patch,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  BadRequestException,
  Get,
} from '@nestjs/common';
import { AtGuard } from '../auth/guard/at.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/user.dto';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('user')
@UseGuards(AtGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Patch()
  async updateMe(
    @CurrentUser('id') userId: string,
    @Body() data: UpdateUserDto,
  ) {
    return this.userService.updateBasicInfo(userId, data);
  }

  @Get()
  async getMe(@CurrentUser('id') userId: string) {
    return this.userService.getBasicInfo(userId);
  }

  @Patch('avatar')
  @UseInterceptors(FileInterceptor('image'))
  async uploadProfileImage(
    @CurrentUser('id') userId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: '.(png|jpeg|jpg|webp)' }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Image file is required');

    return this.userService.uploadProfileImage(userId, file.buffer);
  }
}
