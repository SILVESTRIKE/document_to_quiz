/**
 * Email Service
 */
import nodemailer from "nodemailer";
import { logger } from "../utils/logger.util";

interface EmailOptions {
    to: string;
    subject: string;
    html: string;
}

class EmailService {
    private transporter: nodemailer.Transporter | null = null;
    private from: string;

    constructor() {
        this.from = process.env.EMAIL_FROM || "noreply@app.com";
        this.init();
    }

    private init(): void {
        if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
            logger.warn("[Email] SMTP not configured - emails disabled");
            return;
        }

        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || "587"),
            secure: process.env.SMTP_SECURE === "true",
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });

        logger.info("[Email] SMTP configured");
    }

    async send(options: EmailOptions): Promise<boolean> {
        if (!this.transporter) {
            logger.warn("[Email] Skipped (not configured):", options.subject);
            return false;
        }

        try {
            await this.transporter.sendMail({
                from: this.from,
                to: options.to,
                subject: options.subject,
                html: options.html,
            });
            logger.info(`[Email] Sent to ${options.to}: ${options.subject}`);
            return true;
        } catch (error) {
            logger.error("[Email] Send failed:", error);
            return false;
        }
    }

    async sendWelcome(to: string, userName: string): Promise<boolean> {
        return this.send({
            to,
            subject: "Welcome to Our Platform!",
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #4f46e5;">Welcome, ${userName}!</h1>
          <p>Thank you for joining our platform. We're excited to have you!</p>
          <p>Get started by exploring our features.</p>
        </div>
      `,
        });
    }

    async sendVerificationOtp(to: string, userName: string, otp: string): Promise<boolean> {
        return this.send({
            to,
            subject: "Verify Your Email",
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #4f46e5;">Email Verification</h1>
          <p>Hi ${userName},</p>
          <p>Your verification code is:</p>
          <div style="background: #f3f4f6; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px;">
            ${otp}
          </div>
          <p>This code expires in 10 minutes.</p>
        </div>
      `,
        });
    }

    async sendPasswordResetOtp(to: string, userName: string, otp: string): Promise<boolean> {
        return this.send({
            to,
            subject: "Password Reset",
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #4f46e5;">Password Reset</h1>
          <p>Hi ${userName},</p>
          <p>Your password reset code is:</p>
          <div style="background: #f3f4f6; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px;">
            ${otp}
          </div>
          <p>This code expires in 10 minutes. If you didn't request this, please ignore.</p>
        </div>
      `,
        });
    }
}

export const emailService = new EmailService();
