import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { UpdateUserDto } from './dto/user.dto';
import { CloudinaryService } from '../common/cloudinary/cloudinary.service';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async updateBasicInfo(userId: string, data: UpdateUserDto) {
    const updates: any = {};

    if (data.name) {
      updates.name = data.name.trim();
    }

    if (data.allergies) {
      // Standardize formatting: "peanut" -> "Peanut"
      updates.allergies = data.allergies.map(
        (a) =>
          a.trim().charAt(0).toUpperCase() + a.trim().slice(1).toLowerCase(),
      );
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: updates,
      select: { id: true, name: true, allergies: true },
    });
  }

  async getBasicInfo(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        profileImage: true,
        allergies: true,
      },
    });
  }

  async uploadProfileImage(userId: string, file: Buffer) {
    // 1. Upload to Cloudinary
    const result = await this.cloudinary.uploadImage(file, 'nutrify-profiles');

    // 2. Save secure URL to DB
    return this.prisma.user.update({
      where: { id: userId },
      data: { profileImage: result.secure_url },
      select: { id: true, profileImage: true },
    });
  }
}
