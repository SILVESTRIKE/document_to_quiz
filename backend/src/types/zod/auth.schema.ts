/**
 * Auth Schemas
 */
import { z } from "zod";

export const registerSchema = z.object({
    username: z.string().min(3).max(30).regex(/^[a-z0-9_]+$/i, "Username can only contain letters, numbers, and underscores"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    fullName: z.string().min(2).optional(),
});

export const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1, "Password is required"),
});

export const verifyEmailSchema = z.object({
    email: z.string().email(),
    otp: z.string().length(6, "OTP must be 6 digits"),
});

export const forgotPasswordSchema = z.object({
    email: z.string().email(),
});

export const resetPasswordSchema = z.object({
    email: z.string().email(),
    otp: z.string().length(6),
    newPassword: z.string().min(8),
});

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
