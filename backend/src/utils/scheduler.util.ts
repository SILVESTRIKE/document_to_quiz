/**
 * Scheduler Utility
 */
import cron from "node-cron";
import { logger } from "./logger.util";

interface ScheduledJob {
    name: string;
    task: cron.ScheduledTask;
}

const scheduledJobs: ScheduledJob[] = [];

export function registerSchedule(name: string, cronExpression: string, callback: () => void): void {
    const task = cron.schedule(cronExpression, callback, { scheduled: false });
    scheduledJobs.push({ name, task });
    logger.info(`[Scheduler] Registered: ${name} (${cronExpression})`);
}

export function startSchedulers(): void {
    scheduledJobs.forEach(({ name, task }) => {
        task.start();
        logger.info(`[Scheduler] Started: ${name}`);
    });
}

export function stopSchedulers(): void {
    scheduledJobs.forEach(({ name, task }) => {
        task.stop();
        logger.info(`[Scheduler] Stopped: ${name}`);
    });
}

// ===== Example Scheduled Tasks =====
// Clean up expired sessions every day at 3 AM
registerSchedule("cleanupSessions", "0 3 * * *", async () => {
    logger.info("[Scheduler] Running session cleanup...");
    // TODO: Add cleanup logic here
});
