/**
 * Auth Service
 */
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import User, { IUser } from "../models/user.model";
import { tokenConfig, refreshTokenCookieConfig } from "../config/token.config";
import { redisClient } from "../utils/redis.util";
import { NotAuthorizedError, BadRequestError, ConflictError, NotFoundError } from "../errors";

const REDIS_REFRESH_PREFIX = "refresh_tokens:";

function generateJti(): string {
    return crypto.randomBytes(16).toString("hex");
}

function generateTokens(user: IUser, jti: string) {
    const accessToken = jwt.sign(
        { id: user._id, role: user.role },
        tokenConfig.access.secret,
        { expiresIn: tokenConfig.access.expirationSeconds }
    );
    const refreshToken = jwt.sign(
        { id: user._id, jti },
        tokenConfig.refresh.secret,
        { expiresIn: tokenConfig.refresh.expirationSeconds }
    );
    return { accessToken, refreshToken };
}

export const authService = {
    async register(data: { username: string; email: string; password: string; fullName?: string }) {
        const { username, email, password, fullName } = data;
        const cleanEmail = email.trim().toLowerCase();
        const cleanUsername = username.trim().toLowerCase();

        const existing = await User.findOne({
            $or: [{ email: cleanEmail }, { username: cleanUsername }],
        });
        if (existing) {
            if (existing.email === cleanEmail) {
                throw new ConflictError("Email đã được sử dụng");
            }
            throw new ConflictError("Tên đăng nhập đã tồn tại");
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const user = await User.create({
            username: cleanUsername,
            email: cleanEmail,
            password: hashedPassword,
            fullName,
            isVerified: true,
        });

        return { message: "Đăng ký thành công!", userId: user._id };
    },

    async login(emailOrUsername: string, password: string) {
        const cleanInput = emailOrUsername.trim().toLowerCase();
        console.log("[Auth] Login attempt for:", cleanInput);

        // Tìm user bằng email HOẶC username
        const user = await User.findOne({
            $or: [{ email: cleanInput }, { username: cleanInput }],
            isActive: true
        }).select("+password");

        if (!user || !user.password) {
            console.log("[Auth] User not found or no password");
            throw new NotAuthorizedError("Email/tên đăng nhập hoặc mật khẩu không đúng");
        }

        console.log("[Auth] User found:", user.email, "Comparing passwords...");
        const isMatch = await bcrypt.compare(password, user.password);
        console.log("[Auth] Password match:", isMatch);

        if (!isMatch) {
            throw new NotAuthorizedError("Email/tên đăng nhập hoặc mật khẩu không đúng");
        }

        const jti = generateJti();
        const { accessToken, refreshToken } = generateTokens(user, jti);

        if (redisClient) {
            const key = `${REDIS_REFRESH_PREFIX}${user._id}`;
            await redisClient.sAdd(key, jti);
            await redisClient.expire(key, tokenConfig.refresh.expirationSeconds);
        }

        return {
            user: { id: user._id, username: user.username, email: user.email, role: user.role },
            tokens: { accessToken, refreshToken },
        };
    },

    async logout(refreshToken: string): Promise<void> {
        if (!refreshToken || !redisClient) return;
        try {
            const decoded = jwt.verify(refreshToken, tokenConfig.refresh.secret) as { id: string; jti: string };
            await redisClient.sRem(`${REDIS_REFRESH_PREFIX}${decoded.id}`, decoded.jti);
        } catch { }
    },

    async refreshToken(oldRefreshToken: string) {
        if (!oldRefreshToken) throw new BadRequestError("Refresh token required");
        if (!redisClient) throw new Error("Redis not available");

        let decoded: { id: string; jti: string };
        try {
            decoded = jwt.verify(oldRefreshToken, tokenConfig.refresh.secret) as typeof decoded;
        } catch {
            throw new NotAuthorizedError("Invalid refresh token");
        }

        const key = `${REDIS_REFRESH_PREFIX}${decoded.id}`;
        const isValid = await redisClient.sIsMember(key, decoded.jti);
        if (!isValid) {
            throw new NotAuthorizedError("Session invalid or expired");
        }

        const user = await User.findById(decoded.id);
        if (!user) throw new NotAuthorizedError("User not found");

        // Generate new access token
        const accessToken = jwt.sign(
            { id: user._id, role: user.role },
            tokenConfig.access.secret,
            { expiresIn: tokenConfig.access.expirationSeconds }
        );

        // Generate new refresh token with SAME jti but new expiry (sliding session)
        // This avoids race conditions - same jti stays valid in Redis
        const refreshToken = jwt.sign(
            { id: user._id, jti: decoded.jti },
            tokenConfig.refresh.secret,
            { expiresIn: tokenConfig.refresh.expirationSeconds }
        );

        // Extend session expiry in Redis
        await redisClient.expire(key, tokenConfig.refresh.expirationSeconds);

        return { accessToken, refreshToken };
    },
};
