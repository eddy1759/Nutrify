import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    const transportOpts = {
      host: this.configService.getOrThrow<string>('SMTP_HOST'),
      port: this.configService.getOrThrow<number>('SMTP_PORT'),
      secure: this.configService.get<boolean>('SMTP_SECURE', false),
      auth: {
        user: this.configService.getOrThrow<string>('SMTP_USER'),
        pass: this.configService.getOrThrow<string>('SMTP_PASS'),
      },
    };

    this.transporter = nodemailer.createTransport(transportOpts);

    this.transporter
      .verify()
      .then(() => this.logger.log('📧 Email service configured and ready'))
      .catch((e) =>
        this.logger.error('❌ Email service configuration error', e),
      );
  }

  @RabbitSubscribe({
    exchange: 'nutrify.events',
    routingKey: 'auth.registered',
    queue: 'email.auth.otp',
  })
  async handleRegistrationEmail(payload: {
    email: string;
    name: string;
    otp: string;
  }) {
    this.logger.log(`📨 Processing Registration OTP for: ${payload.email}`);
    await this.sendOtp(payload.email, payload.otp);
  }

  @RabbitSubscribe({
    exchange: 'nutrify.events',
    routingKey: 'auth.forgot_password',
    queue: 'email.auth.reset',
  })
  async handleForgotPassEmail(payload: { email: string; otp: string }) {
    this.logger.log(`📨 Processing Password Reset OTP for: ${payload.email}`);
    await this.sendOtp(payload.email, payload.otp);
  }

  @RabbitSubscribe({
    exchange: 'nutrify.events',
    routingKey: 'auth.verified',
    queue: 'email.auth.welcome',
  })
  async handleWelcomeEmail(payload: { email: string; name: string }) {
    this.logger.log(`📨 Processing Welcome Email for: ${payload.email}`);
    await this.sendWelcomeMail(payload.email, payload.name);
  }

  private async sendEmail(
    to: string,
    subject: string,
    html: string,
  ): Promise<void> {
    const mailOpts = {
      from: `"NutrifyAI Support" <${this.configService.get('SMTP_USER')}>`,
      to,
      subject,
      html,
    };

    try {
      const info = await this.transporter.sendMail(mailOpts);
      this.logger.log(`✅ Email sent to ${to}: ${info.messageId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send email to ${to}:`, error);
      // In RabbitMQ, if we throw here, the message will be NACKed and retried.
      // This is good for transient errors (network), but bad for persistent ones (bad email).
      // For now, we log only to avoid infinite loops on bad emails.
    }
  }

  /**
   * Sends a One-Time Password (OTP)
   */
  private async sendOtp(to: string, otp: string) {
    const subject = 'Your NutrifyAI Security Code';
    const html = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff;">
            <h2 style="color: #2c3e50; text-align: center;">Verify Your Account</h2>
            <p style="color: #666; font-size: 16px; line-height: 1.5;">Use the code below to complete your sign-in or verification process. This code expires in 5 minutes.</p>
            
            <div style="background-color: #f8f9fa; padding: 15px; text-align: center; border-radius: 6px; margin: 20px 0;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #27ae60;">
                    ${otp}
                </span>
            </div>
            
            <p style="color: #999; font-size: 12px; text-align: center; margin-top: 20px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
    `;
    await this.sendEmail(to, subject, html);
  }

  /**
   * Sends a professional Welcome Email
   */
  private async sendWelcomeMail(to: string, name: string) {
    const subject = 'Welcome to NutrifyAI! 🌱';
    const loginUrl =
      this.configService.get<string>('FRONTEND_URL') || 'https://nutrify.ai';

    const html = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px;">
          <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #eeeeee;">
             <h1 style="color: #2c3e50; margin: 0; font-size: 24px;">NutrifyAI</h1>
          </div>
          <div style="padding: 30px 0;">
            <h2 style="color: #34495e; font-size: 22px; margin-top: 0;">Hello, ${name}!</h2>
            <p style="color: #555; font-size: 16px; line-height: 1.6;">
               Welcome to the future of nutrition. We are thrilled to have you join our community of health enthusiasts.
            </p>
            <div style="background-color: #f0f7f4; padding: 20px; border-radius: 8px; margin: 20px 0;">
               <ul style="color: #2c3e50; padding-left: 20px; margin: 0; font-size: 15px; line-height: 1.8;">
                 <li>📸 <strong>Scan Meals:</strong> Get instant calorie & macro estimates.</li>
                 <li>🥗 <strong>Plan Weeks:</strong> Generate AI-powered meal plans.</li>
                 <li>⚠️ <strong>Stay Safe:</strong> Automatic allergen alerts.</li>
               </ul>
            </div>
            <p style="color: #555; font-size: 16px;">Ready to log your first meal?</p>
            <div style="text-align: center; margin-top: 30px; margin-bottom: 20px;">
              <a href="${loginUrl}" style="background-color: #27ae60; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">Get Started</a>
            </div>
          </div>
          <div style="text-align: center; padding-top: 20px; border-top: 1px solid #eeeeee; font-size: 12px; color: #aaa;">
            <p>&copy; ${new Date().getFullYear()} NutrifyAI. All rights reserved.</p>
          </div>
        </div>
    `;

    await this.sendEmail(to, subject, html);
  }
}
