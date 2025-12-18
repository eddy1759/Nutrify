import {
  Controller,
  Post,
  Get,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Body,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  HttpCode,
  HttpStatus,
  Headers,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ScanService } from './scan.service';
import { randomUUID } from 'crypto';
import { AtGuard } from '../auth/guard/at.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('scan')
export class ScanController {
  constructor(private readonly scanService: ScanService) {}

  /**
   * Main Endpoint: Upload Image & Analyze
   * Limits: 10MB max, PNG/JPEG/WEBP/GIF only
   */
  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AtGuard)
  @UseInterceptors(FileInterceptor('image'))
  async analyzeScan(
    @CurrentUser('id') userId: string,
    @Headers('x-correlation-id') correlationIdHeader: string,
    @Body('productName') productName: string, // User can manually name the product
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB
          new FileTypeValidator({ fileType: '.(png|jpeg|jpg|webp|gif)' }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    const correlationId = correlationIdHeader || randomUUID();

    // 3. Call Service
    return this.scanService.processImageScan(
      userId,
      file.buffer,
      correlationId,
      productName,
    );
  }

  /**
   * Health Check
   * Returns status of ML Service, Gemini, and Database
   */
  @Get('health')
  async checkHealth() {
    return this.scanService.checkHealth();
  }

  @Get('history')
  @UseGuards(AtGuard)
  async getUserHistory(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    const take = limit ? parseInt(limit) : 20;
    const skip = page ? (parseInt(page) - 1) * take : 0;

    return this.scanService.getUserScans(userId, take, skip);
  }

  @Get(':id')
  @UseGuards(AtGuard)
  async getScanDetails(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.scanService.getScanById(id, userId);
  }

  @Delete(':id')
  @UseGuards(AtGuard)
  async deleteScan(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.scanService.deleteScan(id, userId);
  }
}
