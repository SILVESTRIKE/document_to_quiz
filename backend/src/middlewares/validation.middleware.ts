/**
 * Validation Middleware (Zod)
 */
import { Request, Response, NextFunction, RequestHandler } from "express";
import { ZodSchema, ZodError } from "zod";
import { BadRequestError } from "../errors";

type ValidationTarget = "body" | "query" | "params";

export function validate(schema: ZodSchema, target: ValidationTarget = "body"): RequestHandler {
    return function (req: Request, res: Response, next: NextFunction) {
        try {
            const result = schema.safeParse(req[target]);
            if (!result.success) {
                throw new BadRequestError(result.error);
            }
            req[target] = result.data;
            next();
        } catch (error) {
            next(error);
        }
    };
}
