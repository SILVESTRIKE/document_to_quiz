/**
 * Redis Utility
 */
import { createClient, RedisClientType } from "redis";
import { logger } from "./logger.util";

let redisClient: RedisClientType | null = null;

async function initRedis(): Promise<void> {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
        logger.warn("[Redis] REDIS_URL not set - Redis features disabled");
        return;
    }

    try {
        redisClient = createClient({ url: redisUrl });
        redisClient.on("error", (err) => logger.error("[Redis] Error:", err));
        await redisClient.connect();
        logger.info("[Redis] Connected");
    } catch (error) {
        logger.error("[Redis] Connection failed:", error);
        redisClient = null;
    }
}

initRedis();

export async function getFromCache(key: string): Promise<string | null> {
    if (!redisClient) return null;
    return redisClient.get(key);
}

export async function setInCache(key: string, value: string, expiresIn?: number): Promise<void> {
    if (!redisClient) return;
    if (expiresIn) {
        await redisClient.setEx(key, expiresIn, value);
    } else {
        await redisClient.set(key, value);
    }
}

export async function deleteFromCache(key: string): Promise<void> {
    if (!redisClient) return;
    await redisClient.del(key);
}

export { redisClient };
