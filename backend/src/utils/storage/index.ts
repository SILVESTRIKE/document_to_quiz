/**
 * Unified Storage Service
 * Local storage for media files. Documents are stored on Google Drive.
 */
import { localStorageService, UploadResult } from "./local.storage";
import { logger } from "../logger.util";

export interface UnifiedUploadResult {
    url: string;
    path: string;
    filename?: string;
}

class StorageService {
    constructor() {
        logger.info("[Storage] Using local storage mode");
    }

    async upload(
        buffer: Buffer,
        folder: string,
        filename: string
    ): Promise<UnifiedUploadResult> {
        const result = await localStorageService.uploadBuffer(buffer, folder, filename);
        return { url: result.url, path: result.path, filename: result.filename };
    }

    async uploadFile(
        filePath: string,
        folder: string,
        filename: string
    ): Promise<UnifiedUploadResult> {
        const result = await localStorageService.uploadFile(filePath, folder, filename);
        return { url: result.url, path: result.path, filename: result.filename };
    }

    async delete(path: string): Promise<boolean> {
        return localStorageService.delete(path);
    }

    getUrl(path: string): string {
        return localStorageService.getUrl(path);
    }
}

export const storageService = new StorageService();
export { localStorageService } from "./local.storage";

