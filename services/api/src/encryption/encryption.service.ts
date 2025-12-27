import {
  Injectable,
  Logger,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  CipherGCM,
  DecipherGCM,
} from 'crypto';

@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionService.name);
  private key!: Buffer;
  private readonly ALGORITHM: string = 'aes-256-gcm';
  private readonly IV_LENGTH: number = 16;
  private readonly SALT: string = 'd4768c577cfced2d5fcff8da17b6d72e';
  private readonly AUTH_TAG_LENGTH: number = 16;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const secret = this.config.get<string>('ENCRYPTION_KEY');
    if (!secret || secret.length !== 32) {
      throw new Error('Invalid encryption length');
    }

    this.key = scryptSync(secret, this.SALT, 32);
  }

  encrypt(text: string): string {
    try {
      const iv = randomBytes(this.IV_LENGTH);
      const cipher = createCipheriv(this.ALGORITHM, this.key, iv) as CipherGCM;
      const encrypted = Buffer.concat([
        cipher.update(text, 'utf8'),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();
      return Buffer.concat([iv, authTag, encrypted]).toString('hex');
    } catch (error) {
      this.logger.error('Failed to encrypt data.', error);
      throw new InternalServerErrorException('Failed to encrypt data.');
    }
  }

  decrypt(encryptedText: string): string {
    try {
      const data = Buffer.from(encryptedText, 'hex');
      const iv = data.subarray(0, this.IV_LENGTH);
      const authTag = data.subarray(
        this.IV_LENGTH,
        this.IV_LENGTH + this.AUTH_TAG_LENGTH,
      );
      const encrypted = data.subarray(this.IV_LENGTH + this.AUTH_TAG_LENGTH);

      const decipher = createDecipheriv(
        this.ALGORITHM,
        this.key,
        iv,
      ) as DecipherGCM;

      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    } catch (error) {
      this.logger.error('Failed to decrypt data.', error);
      throw new InternalServerErrorException('Failed to decrypt data.');
    }
  }
}
