/**
 * App Configuration
 * Main Express application setup with all middleware and routes.
 */
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import cookieParser from "cookie-parser";
import compression from "compression";
import helmet from "helmet";
import expressLayouts from "express-ejs-layouts";

import { errorHandlerMiddleware } from "./middlewares/errorHandler.middleware";
import { corsMiddleware } from "./middlewares/cors.middleware";
import { apiLimiter } from "./middlewares/rateLimiter.middleware";
import "./utils/redis.util";
import { startSchedulers } from "./utils/scheduler.util";

// Import routes
import authRoutes from "./routes/auth.route";
import userRoutes from "./routes/user.route";
import productRoutes from "./routes/product.route";
import mediaRoutes from "./routes/media.route";
import feedbackRoutes from "./routes/feedback.route";
import adminRoutes from "./routes/admin.route";
import quizRoutes from "./routes/quiz.route";
import viewRoutes from "./routes/view.route";
import { startQuizWorker } from "./workers/quiz.worker";

// Swagger
import swaggerUi from "swagger-ui-express";
import swaggerJSDoc from "swagger-jsdoc";
import { swaggerOptions } from "./config/swagger.config";

const swaggerSpec = swaggerJSDoc(swaggerOptions);
const app = express();

// Trust proxy for rate limiting behind reverse proxy
app.set("trust proxy", 1);

// ===== EJS View Engine Setup =====
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(expressLayouts);
app.set("layout", "layouts/main");

// ===== Security & Performance Middleware =====
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com"],
            scriptSrcAttr: ["'unsafe-inline'"], // Allow inline onclick handlers
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
        },
    },
})); // Security headers with CSP for TailwindCSS
app.use(compression()); // Gzip compression
app.use(corsMiddleware);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());

// ===== Static Files =====
const uploadsDir = path.join(__dirname, "..", "uploads");
app.use("/uploads", express.static(uploadsDir));

// ===== Swagger API Documentation =====
if (process.env.NODE_ENV !== "production") {
    app.get("/api-docs.json", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.send(swaggerSpec);
    });

    app.use(
        "/api-docs",
        swaggerUi.serve,
        swaggerUi.setup(undefined, {
            swaggerUrl: "/api-docs.json",
            swaggerOptions: { tryItOutEnabled: true },
        })
    );
} else {
    app.use("/api-docs", (req, res) => {
        res.status(404).json({ message: "Not found" });
    });
}

// ===== Health Check =====
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || "development",
        storageMode: process.env.STORAGE_MODE || "local",
    });
});

// ===== Rate Limiting =====
app.use(apiLimiter);

// ===== API Routes =====
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/v1/quizzes", quizRoutes);

// ===== View Routes (EJS Pages) =====
app.use("/", viewRoutes);

// ===== 404 Handler for non-API routes =====
app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
        res.status(404).json({ error: "Not found" });
    } else {
        res.status(404).render("errors/404", {
            title: "Không tìm thấy",
            user: null,
            flash: null
        });
    }
});

// ===== Error Handler (must be last) =====
app.use(errorHandlerMiddleware);

// ===== Start Scheduled Tasks =====
startSchedulers();

// ===== Start Quiz Worker =====
startQuizWorker();

export default app;

