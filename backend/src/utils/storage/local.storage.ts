/**
 * Local Storage Service
 * Disk-based file storage for development or self-hosted servers.
 */
import fs from "fs/promises";
import path from "path";
import { logger } from "../logger.util";

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");

export interface UploadResult {
    url: string;
    path: string;
    filename: string;
    mimetype: string;
    size: number;
}

class LocalStorageService {
    private baseUrl: string;
    private uploadsPath: string;

    constructor() {
        this.baseUrl = process.env.BASE_URL || "http://localhost:5000";
        this.uploadsPath = UPLOADS_DIR;
        this.ensureDirectoryExists(this.uploadsPath);
    }

    private async ensureDirectoryExists(dirPath: string): Promise<void> {
        try {
            await fs.mkdir(dirPath, { recursive: true });
        } catch { }
    }

    async uploadBuffer(buffer: Buffer, folder: string, filename: string): Promise<UploadResult> {
        const folderPath = path.join(this.uploadsPath, folder);
        await this.ensureDirectoryExists(folderPath);

        const filePath = path.join(folderPath, filename);
        await fs.writeFile(filePath, buffer);

        const relativePath = path.join("uploads", folder, filename).replace(/\\/g, "/");
        const url = `${this.baseUrl}/${relativePath}`;

        logger.info(`[LocalStorage] Uploaded: ${relativePath}`);
        return {
            url,
            path: relativePath,
            filename,
            mimetype: this.getMimeType(filename),
            size: buffer.length,
        };
    }

    async uploadFile(tempPath: string, folder: string, filename: string): Promise<UploadResult> {
        const buffer = await fs.readFile(tempPath);
        const result = await this.uploadBuffer(buffer, folder, filename);
        try {
            await fs.unlink(tempPath);
        } catch { }
        return result;
    }

    async delete(filePath: string): Promise<boolean> {
        try {
            const fullPath = path.join(process.cwd(), filePath);
            await fs.unlink(fullPath);
            logger.info(`[LocalStorage] Deleted: ${filePath}`);
            return true;
        } catch {
            return false;
        }
    }

    getUrl(relativePath: string): string {
        return `${this.baseUrl}/${relativePath}`;
    }

    private getMimeType(filename: string): string {
        const ext = path.extname(filename).toLowerCase();
        const mimeTypes: Record<string, string> = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".mp4": "video/mp4",
            ".pdf": "application/pdf",
        };
        return mimeTypes[ext] || "application/octet-stream";
    }
}

export const localStorageService = new LocalStorageService();
