/**
 * Rate Limiter Middleware
 */
import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { redisClient } from "../utils/redis.util";

// API rate limiter
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    message: { success: false, message: "Too many requests, please try again later" },
    standardHeaders: true,
    legacyHeaders: false,
    ...(redisClient && {
        store: new RedisStore({
            sendCommand: (...args: string[]) => redisClient!.sendCommand(args),
        }),
    }),
});

// Auth rate limiter (stricter)
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: "Too many login attempts, please try again later" },
    standardHeaders: true,
    legacyHeaders: false,
});
