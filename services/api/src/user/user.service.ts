import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { UpdateUserProfileDto } from './dto/user.dto';
import { CloudinaryService } from '../common/cloudinary/cloudinary.service';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async updateUserProfile(userId: string, data: UpdateUserProfileDto) {
    let cleanAllergies;
    let cleanedName;

    if (data.allergies) {
      cleanAllergies = data.allergies.map(
        (a) =>
          a.trim().charAt(0).toUpperCase() +
          a.trim().slice(1).toLocaleLowerCase(),
      );
    }

    if (data.name) {
      cleanedName = data.name.trim().toLowerCase();
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        name: cleanedName,
        allergies: cleanAllergies,
      },
      select: { id: true, allergies: true },
    });
  }

  async getUserProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, allergies: true },
    });
  }

  async uploadProfileImage(userId: string, file: Buffer) {
    // 1. Upload to Cloudinary
    const result = await this.cloudinary.uploadImage(file, 'nutrify-profiles');

    // 2. Save URL to DB
    return this.prisma.user.update({
      where: { id: userId },
      data: { profileImage: result.secure_url }, // Use secure_url (https)
      select: { id: true, profileImage: true },
    });
  }
}
