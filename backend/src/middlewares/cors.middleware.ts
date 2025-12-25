/**
 * CORS Middleware
 */
import cors from "cors";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

export const corsMiddleware = cors({
    origin: (origin, callback) => {
        // In production, use env-based allowed origins
        const allowedOrigins = [
            BACKEND_URL,
            process.env.FRONTEND_URL,
            "http://localhost:3000",
            "http://localhost:3001",
            "http://localhost:5000",
        ].filter(Boolean); // Remove undefined values

        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            // In production, reject; in dev, allow all
            if (process.env.NODE_ENV === "production") {
                callback(new Error("Not allowed by CORS"));
            } else {
                callback(null, true);
            }
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
});
