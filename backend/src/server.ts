/**
 * Server Entry Point
 * Starts the HTTP server and handles graceful shutdown.
 */
import http from "http";
import expressWs from "express-ws";
import app from "./app";
import { connectDB, closeDB } from "./config/db.config";
import { logger } from "./utils/logger.util";
import { stopSchedulers } from "./utils/scheduler.util";

async function startServer() {
    // Validate required environment variables
    const requiredEnvVars = ["JWT_SECRET", "MONGO_URI"];
    for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
            throw new Error(`${envVar} must be defined in .env file`);
        }
    }

    // Connect to database
    await connectDB();

    const PORT = process.env.PORT || 5000;

    // Create HTTP server with optional WebSocket support
    const server = http.createServer(app);
    const wsInstance = expressWs(app, server);
    const { app: wsApp } = wsInstance;

    // ===== WebSocket Endpoints =====
    wsApp.ws("/ws/notifications", (ws, req) => {
        logger.info("[WebSocket] Client connected to notifications");

        ws.on("message", (msg: string) => {
            try {
                const data = JSON.parse(msg.toString());
                logger.debug(`[WebSocket] Received: ${JSON.stringify(data)}`);
            } catch {
                logger.warn("[WebSocket] Invalid JSON received");
            }
        });

        ws.on("close", () => {
            logger.info("[WebSocket] Client disconnected");
        });
    });

    // Start HTTP server
    const httpServer = server.listen(PORT, () => {
        logger.info(`[Server] Running on http://localhost:${PORT}`);
        logger.info(`[Server] API Docs: http://localhost:${PORT}/api-docs`);
        logger.info(`[Server] Environment: ${process.env.NODE_ENV || "development"}`);
    });

    // ===== Graceful Shutdown =====
    async function gracefulShutdown(signal: string) {
        logger.info(`[Server] Received ${signal}. Starting graceful shutdown...`);

        httpServer.close(async () => {
            logger.info("[Server] HTTP server closed.");

            // Stop scheduled tasks
            stopSchedulers();

            // Close database connection
            await closeDB();

            logger.info("[Server] Graceful shutdown complete.");
            process.exit(0);
        });

        // Force shutdown after 10 seconds
        setTimeout(() => {
            logger.error("[Server] Could not close connections in time, forcefully shutting down");
            process.exit(1);
        }, 10000);
    }

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

startServer().catch((err) => {
    console.error("[Server] Failed to start:", err);
    process.exit(1);
});
