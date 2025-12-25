/**
 * Unified Storage Service
 * Uses Google Drive if credentials are available, otherwise falls back to local storage.
 */
import { localStorageService, UploadResult } from "./local.storage";
import { driveStorage } from "./drive.storage";
import { logger } from "../logger.util";
import path from "path";
import fs from "fs";

export interface UnifiedUploadResult {
    url: string;
    path: string;
    filename?: string;
    driveFileId?: string;
}

// Check if Google Drive is configured
function isDriveConfigured(): boolean {
    return !!(
        process.env.GOOGLE_DRIVE_CLIENT_EMAIL &&
        process.env.GOOGLE_DRIVE_PRIVATE_KEY
    );
}

// Get MIME type from file extension
function getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".doc": "application/msword",
        ".txt": "text/plain",
        ".rtf": "application/rtf",
        ".odt": "application/vnd.oasis.opendocument.text",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
    };
    return mimeTypes[ext] || "application/octet-stream";
}

class StorageService {
    private useDrive: boolean;

    constructor() {
        this.useDrive = isDriveConfigured();
        if (this.useDrive) {
            logger.info("[Storage] Using Google Drive storage mode");
        } else {
            logger.info("[Storage] Using local storage mode (Google Drive credentials not found)");
        }
    }

    async upload(
        buffer: Buffer,
        folder: string,
        filename: string
    ): Promise<UnifiedUploadResult> {
        if (this.useDrive) {
            // Write buffer to temp file first, then upload to Drive
            const tempDir = path.join(process.cwd(), "temp");
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            const tempPath = path.join(tempDir, `${Date.now()}_${filename}`);
            fs.writeFileSync(tempPath, buffer);

            try {
                const result = await driveStorage.uploadFile(
                    tempPath,
                    filename,
                    getMimeType(filename)
                );
                return {
                    url: result.webViewLink,
                    path: result.fileId,
                    filename,
                    driveFileId: result.fileId,
                };
            } finally {
                // Clean up temp file
                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath);
                }
            }
        }

        const result = await localStorageService.uploadBuffer(buffer, folder, filename);
        return { url: result.url, path: result.path, filename: result.filename };
    }

    async uploadFile(
        filePath: string,
        folder: string,
        filename: string
    ): Promise<UnifiedUploadResult> {
        if (this.useDrive) {
            const result = await driveStorage.uploadFile(
                filePath,
                filename,
                getMimeType(filename)
            );
            return {
                url: result.webViewLink,
                path: result.fileId,
                filename,
                driveFileId: result.fileId,
            };
        }

        const result = await localStorageService.uploadFile(filePath, folder, filename);
        return { url: result.url, path: result.path, filename: result.filename };
    }

    async delete(pathOrFileId: string): Promise<boolean> {
        if (this.useDrive) {
            return driveStorage.deleteFile(pathOrFileId);
        }
        return localStorageService.delete(pathOrFileId);
    }

    getUrl(pathOrFileId: string): string {
        if (this.useDrive) {
            return `https://drive.google.com/file/d/${pathOrFileId}/view`;
        }
        return localStorageService.getUrl(pathOrFileId);
    }

    isDriveEnabled(): boolean {
        return this.useDrive;
    }
}

export const storageService = new StorageService();
export { localStorageService } from "./local.storage";
export { driveStorage } from "./drive.storage";
