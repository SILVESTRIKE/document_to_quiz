/**
 * Authentication Middleware
 */
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { tokenConfig } from "../config/token.config";
import { NotAuthorizedError } from "../errors";

interface JwtPayload {
    id: string;
    role: string;
    iat: number;
    exp: number;
}

declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
        }
    }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (!token) {
        throw new NotAuthorizedError("Access token required");
    }

    try {
        const decoded = jwt.verify(token, tokenConfig.access.secret) as JwtPayload;
        req.user = decoded;
        next();
    } catch {
        throw new NotAuthorizedError("Invalid or expired token");
    }
}

export function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (token) {
        try {
            const decoded = jwt.verify(token, tokenConfig.access.secret) as JwtPayload;
            req.user = decoded;
        } catch {
            // Token invalid, proceed as unauthenticated
        }
    }

    next();
}
