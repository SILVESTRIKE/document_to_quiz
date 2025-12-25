/**
 * Auth Schemas & Types
 */
import { z } from "zod";

export const registerSchema = z.object({
    username: z.string().min(3).max(30),
    email: z.string().email(),
    password: z.string().min(8),
    fullName: z.string().min(2).optional(),
});

export const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
