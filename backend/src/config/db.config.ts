/**
 * Database Configuration
 */
import mongoose from "mongoose";
import { logger } from "../utils/logger.util";

export async function connectDB(): Promise<void> {
    const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017";
    const dbName = process.env.DB_NAME || "monolith_db";
    const maxRetries = 5;
    let currentRetry = 0;

    while (currentRetry < maxRetries) {
        try {
            await mongoose.connect(`${mongoUri}/${dbName}`);
            logger.info(`[MongoDB] Connected to ${dbName}`);
            return;
        } catch (error) {
            currentRetry++;
            logger.error(`[MongoDB] Connection attempt ${currentRetry} failed:`, error);

            if (currentRetry >= maxRetries) {
                logger.error("[MongoDB] Max retries reached. Giving up.");
                throw error;
            }

            logger.info(`[MongoDB] Retrying in 5 seconds...`);
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }
    }
}

export async function closeDB(): Promise<void> {
    await mongoose.connection.close();
    logger.info("[MongoDB] Connection closed");
}
