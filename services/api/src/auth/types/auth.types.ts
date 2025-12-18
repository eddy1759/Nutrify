export interface JWTPayload {
  sub: string;
  email: string;
  allergies?: string[];
}

export enum OTPPurpose {
  EmailVerification = 'verify-email',
  PasswordReset = 'reset-password',
}

export type JwtPayloadWithRt = JWTPayload & { refreshToken: string };
