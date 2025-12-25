/**
 * OTP Model
 */
import mongoose, { Document, Schema } from "mongoose";

export enum OtpType {
    EMAIL_VERIFICATION = "email_verification",
    PASSWORD_RESET = "password_reset",
}

export interface IOtp extends Document {
    email: string;
    otp: string;
    type: OtpType;
    expiresAt: Date;
    createdAt: Date;
}

const otpSchema = new Schema<IOtp>(
    {
        email: { type: String, required: true, lowercase: true, trim: true },
        otp: { type: String, required: true },
        type: { type: String, enum: Object.values(OtpType), required: true },
        expiresAt: { type: Date, required: true, default: () => new Date(Date.now() + 10 * 60 * 1000) },
    },
    { timestamps: true }
);

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpSchema.index({ email: 1, type: 1 });

export default mongoose.model<IOtp>("Otp", otpSchema);
