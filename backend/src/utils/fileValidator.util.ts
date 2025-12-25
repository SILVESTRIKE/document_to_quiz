/**
 * File Validator Utility
 * Validates file types using magic bytes (file signatures)
 */
import fs from "fs";
import { logger } from "./logger.util";

// Magic byte signatures for supported file types
const FILE_SIGNATURES: Record<string, { signature: Buffer; offset: number }[]> = {
    // PDF: starts with %PDF
    "application/pdf": [
        { signature: Buffer.from([0x25, 0x50, 0x44, 0x46]), offset: 0 }, // %PDF
    ],
    // DOCX is a ZIP file, starts with PK (0x50 0x4B)
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
        { signature: Buffer.from([0x50, 0x4B, 0x03, 0x04]), offset: 0 }, // PK..
        { signature: Buffer.from([0x50, 0x4B, 0x05, 0x06]), offset: 0 }, // Empty archive
        { signature: Buffer.from([0x50, 0x4B, 0x07, 0x08]), offset: 0 }, // Spanned archive
    ],
};

export interface FileValidationResult {
    isValid: boolean;
    detectedType: string | null;
    error?: string;
}

/**
 * Validate file by checking magic bytes
 * @param filePath Path to the file
 * @param expectedMimeType Expected MIME type
 * @returns Validation result
 */
export function validateFileMagicBytes(
    filePath: string,
    expectedMimeType: string
): FileValidationResult {
    try {
        // Read first 8 bytes (enough for our signatures)
        const fd = fs.openSync(filePath, "r");
        const buffer = Buffer.alloc(8);
        fs.readSync(fd, buffer, 0, 8, 0);
        fs.closeSync(fd);

        const signatures = FILE_SIGNATURES[expectedMimeType];
        if (!signatures) {
            logger.warn(`[FileValidator] No signature defined for: ${expectedMimeType}`);
            return { isValid: true, detectedType: expectedMimeType };
        }

        // Check if file matches any valid signature
        for (const { signature, offset } of signatures) {
            const fileSlice = buffer.subarray(offset, offset + signature.length);
            if (fileSlice.equals(signature)) {
                logger.info(`[FileValidator] Valid ${expectedMimeType} file detected`);
                return { isValid: true, detectedType: expectedMimeType };
            }
        }

        // File doesn't match expected signature
        const detectedType = detectFileType(buffer);
        logger.warn(
            `[FileValidator] Magic bytes mismatch! Expected: ${expectedMimeType}, Detected: ${detectedType}`
        );

        return {
            isValid: false,
            detectedType,
            error: `File content does not match expected type. Expected ${expectedMimeType}, detected ${detectedType || "unknown"}`,
        };
    } catch (error) {
        logger.error("[FileValidator] Error reading file:", error);
        return {
            isValid: false,
            detectedType: null,
            error: "Failed to validate file",
        };
    }
}

/**
 * Detect file type from magic bytes
 */
function detectFileType(buffer: Buffer): string | null {
    for (const [mimeType, signatures] of Object.entries(FILE_SIGNATURES)) {
        for (const { signature, offset } of signatures) {
            const fileSlice = buffer.subarray(offset, offset + signature.length);
            if (fileSlice.equals(signature)) {
                return mimeType;
            }
        }
    }

    // Check for common dangerous file types
    const hex = buffer.toString("hex").slice(0, 8);

    // EXE files
    if (hex.startsWith("4d5a")) {
        return "application/x-executable";
    }
    // ELF (Linux executable)
    if (hex.startsWith("7f454c46")) {
        return "application/x-elf";
    }
    // Script files with shebang
    if (buffer.toString("utf8", 0, 2) === "#!") {
        return "text/x-script";
    }

    return null;
}

/**
 * Check if file type could be dangerous
 */
export function isDangerousFileType(detectedType: string | null): boolean {
    const dangerousTypes = [
        "application/x-executable",
        "application/x-elf",
        "text/x-script",
        "application/x-msdownload",
    ];

    return detectedType !== null && dangerousTypes.includes(detectedType);
}
