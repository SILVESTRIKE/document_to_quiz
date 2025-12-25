import { ZodError } from "zod";
import { CustomError } from "./CustomError";

export class BadRequestError extends CustomError {
    statusCode = 400;
    errorContent: string | ZodError;
    constructor(message: string | ZodError) {
        super(typeof message === "string" ? message : "Validation failed");
        this.errorContent = message;
        Object.setPrototypeOf(this, BadRequestError.prototype);
    }
    serializeErrors() {
        if (this.errorContent instanceof ZodError) {
            return this.errorContent.issues.map((issue) => ({
                message: issue.message,
                field: issue.path.join("."),
            }));
        }
        return [{ message: this.errorContent as string }];
    }
}

export class NotAuthorizedError extends CustomError {
    statusCode = 401;
    constructor(message = "Not authorized") {
        super(message);
        Object.setPrototypeOf(this, NotAuthorizedError.prototype);
    }
    serializeErrors() {
        return [{ message: this.message }];
    }
}

export class ForbiddenError extends CustomError {
    statusCode = 403;
    constructor(message = "Access forbidden") {
        super(message);
        Object.setPrototypeOf(this, ForbiddenError.prototype);
    }
    serializeErrors() {
        return [{ message: this.message }];
    }
}

export class NotFoundError extends CustomError {
    statusCode = 404;
    constructor(message = "Resource not found") {
        super(message);
        Object.setPrototypeOf(this, NotFoundError.prototype);
    }
    serializeErrors() {
        return [{ message: this.message }];
    }
}

export class ConflictError extends CustomError {
    statusCode = 409;
    constructor(message = "Resource already exists") {
        super(message);
        Object.setPrototypeOf(this, ConflictError.prototype);
    }
    serializeErrors() {
        return [{ message: this.message }];
    }
}

export class TooManyRequestsError extends CustomError {
    statusCode = 429;
    constructor(message = "Too many requests") {
        super(message);
        Object.setPrototypeOf(this, TooManyRequestsError.prototype);
    }
    serializeErrors() {
        return [{ message: this.message }];
    }
}

export class AppError extends CustomError {
    statusCode = 500;
    constructor(message = "Internal server error") {
        super(message);
        Object.setPrototypeOf(this, AppError.prototype);
    }
    serializeErrors() {
        return [{ message: this.message }];
    }
}

export { CustomError };
