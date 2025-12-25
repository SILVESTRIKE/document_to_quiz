/**
 * Database Configuration
 */
import mongoose from "mongoose";
import { logger } from "../utils/logger.util";

export async function connectDB(): Promise<void> {
    const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017";
    const dbName = process.env.DB_NAME || "monolith_db";

    try {
        await mongoose.connect(`${mongoUri}/${dbName}`);
        logger.info(`[MongoDB] Connected to ${dbName}`);
    } catch (error) {
        logger.error("[MongoDB] Connection failed:", error);
        throw error;
    }
}

export async function closeDB(): Promise<void> {
    await mongoose.connection.close();
    logger.info("[MongoDB] Connection closed");
}
