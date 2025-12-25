/**
 * Auth Controller
 * Handles HTTP request/response for authentication endpoints.
 */
import { Request, Response, NextFunction } from "express";
import { authService } from "../services/auth.service";
import { refreshTokenCookieConfig } from "../config/token.config";

export const authController = {
    async register(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await authService.register(req.body);
            res.status(201).json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    },

    async login(req: Request, res: Response, next: NextFunction) {
        try {
            const { email, password } = req.body;
            const result = await authService.login(email, password);
            res.cookie("refreshToken", result.tokens.refreshToken, refreshTokenCookieConfig);
            res.json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    },

    async logout(req: Request, res: Response, next: NextFunction) {
        try {
            const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
            await authService.logout(refreshToken);
            res.clearCookie("refreshToken", { path: refreshTokenCookieConfig.path });
            res.json({ success: true, message: "Logged out" });
        } catch (error) {
            next(error);
        }
    },

    async refreshToken(req: Request, res: Response, next: NextFunction) {
        try {
            const token = req.cookies.refreshToken || req.body.refreshToken;
            console.log("[Auth] Refresh attempt - Cookie refreshToken:", req.cookies.refreshToken ? "present" : "missing");
            console.log("[Auth] Refresh attempt - Body refreshToken:", req.body.refreshToken ? "present" : "missing");
            console.log("[Auth] All cookies:", Object.keys(req.cookies));

            const result = await authService.refreshToken(token);
            console.log("[Auth] Refresh SUCCESS - Setting new cookie and returning tokens");
            res.cookie("refreshToken", result.refreshToken, refreshTokenCookieConfig);
            res.json({ success: true, tokens: result });
        } catch (error) {
            console.log("[Auth] Refresh failed:", error);
            next(error);
        }
    },
};
