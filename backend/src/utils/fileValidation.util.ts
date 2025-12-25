/**
 * File Validation Utility
 * Deep validation of uploaded files using file-type library.
 * Prevents polyglot attacks and ensures file integrity.
 */
import { logger } from "./logger.util";

// Dynamic import for file-type (ESM module)
let fileTypeFromBuffer: ((buffer: Buffer) => Promise<{ ext: string; mime: string } | undefined>) | null = null;

// Initialize file-type dynamically
async function initFileType() {
    try {
        const fileType = await import("file-type");
        // file-type v16+ exports fromBuffer
        fileTypeFromBuffer = fileType.fromBuffer || fileType.default?.fromBuffer;
    } catch {
        logger.warn("[FileValidation] file-type not available, using fallback");
    }
}
initFileType();

// Allowed MIME types for document upload
const ALLOWED_DOCUMENT_TYPES: Record<string, string[]> = {
    pdf: ["application/pdf"],
    docx: [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/zip", // DOCX is actually a ZIP file
    ],
};

// Magic bytes for quick validation
const MAGIC_BYTES = {
    pdf: Buffer.from([0x25, 0x50, 0x44, 0x46]), // %PDF
    docx: Buffer.from([0x50, 0x4b, 0x03, 0x04]), // PK.. (ZIP header)
};

export interface FileValidationResult {
    isValid: boolean;
    detectedType: string | null;
    detectedMime: string | null;
    error?: string;
}

/**
 * Validate file buffer using deep inspection
 */
export async function validateFileBuffer(
    buffer: Buffer,
    expectedType: "pdf" | "docx"
): Promise<FileValidationResult> {
    try {
        // 1. Quick magic bytes check
        const magicBytes = MAGIC_BYTES[expectedType];
        if (!buffer.subarray(0, magicBytes.length).equals(magicBytes)) {
            return {
                isValid: false,
                detectedType: null,
                detectedMime: null,
                error: `Invalid file header. Expected ${expectedType.toUpperCase()} magic bytes.`,
            };
        }

        // 2. Deep file type detection (if available)
        if (fileTypeFromBuffer) {
            const detected = await fileTypeFromBuffer(buffer);

            if (!detected) {
                // Magic bytes matched but file-type couldn't identify - allow it
                return {
                    isValid: true,
                    detectedType: expectedType,
                    detectedMime: null,
                };
            }

            // 3. Check against allowed types
            const allowedMimes = ALLOWED_DOCUMENT_TYPES[expectedType];
            const isAllowed = allowedMimes.includes(detected.mime);

            if (!isAllowed) {
                logger.warn(
                    `[FileValidation] Rejected file: expected ${expectedType}, got ${detected.ext} (${detected.mime})`
                );
                return {
                    isValid: false,
                    detectedType: detected.ext,
                    detectedMime: detected.mime,
                    error: `Invalid file type. Expected ${expectedType}, got ${detected.ext}`,
                };
            }

            logger.info(`[FileValidation] Validated ${expectedType}: ${detected.mime}`);

            return {
                isValid: true,
                detectedType: detected.ext,
                detectedMime: detected.mime,
            };
        }

        // Fallback: Magic bytes matched, allow
        return {
            isValid: true,
            detectedType: expectedType,
            detectedMime: null,
        };
    } catch (error: any) {
        logger.error(`[FileValidation] Error:`, error);
        return {
            isValid: false,
            detectedType: null,
            detectedMime: null,
            error: error.message || "File validation failed",
        };
    }
}

/**
 * Quick file extension check (for use before buffer is available)
 */
export function isAllowedExtension(filename: string): boolean {
    const ext = filename.toLowerCase().split(".").pop();
    return ext === "pdf" || ext === "docx";
}

/**
 * Get expected type from filename
 */
export function getExpectedType(filename: string): "pdf" | "docx" | null {
    const ext = filename.toLowerCase().split(".").pop();
    if (ext === "pdf") return "pdf";
    if (ext === "docx") return "docx";
    return null;
}
