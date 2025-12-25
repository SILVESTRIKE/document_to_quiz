/**
 * Error Handler Middleware
 */
import { Request, Response, NextFunction } from "express";
import { CustomError } from "../errors";
import { logger } from "../utils/logger.util";

export function errorHandlerMiddleware(
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
): void {
    if (err instanceof CustomError) {
        res.status(err.statusCode).json({
            success: false,
            errors: err.serializeErrors(),
        });
        return;
    }

    logger.error(`[Error] ${err.message}`, { stack: err.stack });

    res.status(500).json({
        success: false,
        errors: [{ message: "Something went wrong" }],
    });
}
