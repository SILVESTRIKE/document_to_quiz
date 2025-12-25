/**
 * Winston Logger Utility
 */
import winston from "winston";

const logFormat = winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
        if (Object.keys(meta).length > 0) {
            msg += ` ${JSON.stringify(meta)}`;
        }
        return msg;
    })
);

export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || "info",
    format: logFormat,
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(winston.format.colorize(), logFormat),
        }),
        // Add file transport in production
        ...(process.env.NODE_ENV === "production"
            ? [
                new winston.transports.File({ filename: "logs/error.log", level: "error" }),
                new winston.transports.File({ filename: "logs/combined.log" }),
            ]
            : []),
    ],
});
