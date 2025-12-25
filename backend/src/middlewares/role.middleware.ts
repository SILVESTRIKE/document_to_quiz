/**
 * Role Middleware
 */
import { Request, Response, NextFunction, RequestHandler } from "express";
import { ForbiddenError } from "../errors";

export function requireRole(...roles: string[]): RequestHandler {
    return function (req: Request, res: Response, next: NextFunction) {
        if (!req.user) {
            throw new ForbiddenError("Authentication required");
        }

        if (!roles.includes(req.user.role)) {
            throw new ForbiddenError("Insufficient permissions");
        }

        next();
    };
}

export const requireAdmin = requireRole("admin");
export const requireModerator = requireRole("admin", "moderator");
