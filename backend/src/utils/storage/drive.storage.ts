/**
 * Google Drive Storage
 * Handles file uploads and downloads from Google Drive.
 */
import { google } from "googleapis";
import { Readable } from "stream";
import path from "path";
import fs from "fs";
import { logger } from "../logger.util";

// Google Drive API setup
function getDriveClient() {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        },
        scopes: ["https://www.googleapis.com/auth/drive.file"],
    });

    return google.drive({ version: "v3", auth });
}

export const driveStorage = {
    /**
     * Upload a file to Google Drive
     */
    async uploadFile(
        filePath: string,
        fileName: string,
        mimeType: string
    ): Promise<{ fileId: string; webViewLink: string }> {
        const drive = getDriveClient();
        const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

        const fileMetadata: any = {
            name: fileName,
        };

        if (folderId) {
            fileMetadata.parents = [folderId];
        }

        const media = {
            mimeType,
            body: fs.createReadStream(filePath),
        };

        try {
            const response = await drive.files.create({
                requestBody: fileMetadata,
                media,
                fields: "id, webViewLink",
            });

            const fileId = response.data.id!;

            // Make file accessible via link
            await drive.permissions.create({
                fileId,
                requestBody: {
                    role: "reader",
                    type: "anyone",
                },
            });

            // Get the updated webViewLink
            const file = await drive.files.get({
                fileId,
                fields: "webViewLink",
            });

            logger.info(`[DriveStorage] Uploaded file: ${fileName}, ID: ${fileId}`);

            return {
                fileId,
                webViewLink: file.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
            };
        } catch (error) {
            logger.error(`[DriveStorage] Upload failed:`, error);
            throw error;
        }
    },

    /**
     * Download a file from Google Drive to local temp directory
     */
    async downloadFile(fileId: string, destPath: string): Promise<string> {
        const drive = getDriveClient();

        try {
            const response = await drive.files.get(
                { fileId, alt: "media" },
                { responseType: "stream" }
            );

            const destDir = path.dirname(destPath);
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }

            const dest = fs.createWriteStream(destPath);

            return new Promise((resolve, reject) => {
                (response.data as Readable)
                    .on("end", () => {
                        logger.info(`[DriveStorage] Downloaded file to: ${destPath}`);
                        resolve(destPath);
                    })
                    .on("error", (err: Error) => {
                        logger.error(`[DriveStorage] Download failed:`, err);
                        reject(err);
                    })
                    .pipe(dest);
            });
        } catch (error) {
            logger.error(`[DriveStorage] Download failed:`, error);
            throw error;
        }
    },

    /**
     * Delete a file from Google Drive
     */
    async deleteFile(fileId: string): Promise<boolean> {
        const drive = getDriveClient();

        try {
            await drive.files.delete({ fileId });
            logger.info(`[DriveStorage] Deleted file: ${fileId}`);
            return true;
        } catch (error) {
            logger.error(`[DriveStorage] Delete failed:`, error);
            return false;
        }
    },

    /**
     * Extract file ID from Google Drive URL
     */
    extractFileId(url: string): string | null {
        const patterns = [
            /\/file\/d\/([a-zA-Z0-9_-]+)/,
            /id=([a-zA-Z0-9_-]+)/,
            /^([a-zA-Z0-9_-]+)$/,
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }

        return null;
    },
};
