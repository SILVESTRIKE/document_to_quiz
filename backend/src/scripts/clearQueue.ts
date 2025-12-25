/**
 * Clear all quiz jobs from BullMQ queue
 */
import { Queue } from "bullmq";

const QUEUE_NAME = "quiz-processing";

async function clearQueue() {
    const queue = new Queue(QUEUE_NAME, {
        connection: {
            host: process.env.REDIS_HOST || "localhost",
            port: parseInt(process.env.REDIS_PORT || "6379"),
        },
    });

    console.log("Clearing quiz queue...");

    // Remove all jobs
    await queue.obliterate({ force: true });

    console.log("Queue cleared!");
    await queue.close();
    process.exit(0);
}

clearQueue().catch(console.error);
