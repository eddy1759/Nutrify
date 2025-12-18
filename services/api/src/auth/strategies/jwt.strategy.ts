import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JWTPayload } from '../types/auth.types';
import { PrismaService } from 'src/common/prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      // Extract token from authorization header
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      //ignore expired tokens
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  // The return value of this function is attached to `req.user`
  async validate(payload: JWTPayload) {
    return {
      id: payload.sub,
      email: payload.email,
      allergies: payload.allergies,
    };
  }
}
