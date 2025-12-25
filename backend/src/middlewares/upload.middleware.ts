/**
 * Upload Middleware (Multer)
 * Handles file uploads for documents, media, and avatars.
 */
import multer from "multer";
import { Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

// ===========================
// Upload Directories
// ===========================
const UPLOAD_BASE = path.join(process.cwd(), "uploads");
const TEMP_UPLOAD_DIR = path.join(UPLOAD_BASE, "temp");
const DOCUMENTS_DIR = path.join(UPLOAD_BASE, "documents");

// Ensure directories exist on startup
function ensureDirectories() {
    const dirs = [TEMP_UPLOAD_DIR, DOCUMENTS_DIR];
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`[Upload] Created directory: ${dir}`);
        }
    }
}
ensureDirectories();

// ===========================
// Allowed File Types
// ===========================

// Document types for quiz generation
const ALLOWED_DOCUMENT_MIMES: Record<string, string[]> = {
    // Word documents
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    "application/msword": [".doc"],
    // PDF
    "application/pdf": [".pdf"],
    // Text files
    "text/plain": [".txt"],
    // Rich Text
    "application/rtf": [".rtf"],
    // OpenDocument
    "application/vnd.oasis.opendocument.text": [".odt"],
};

const ALLOWED_DOCUMENT_EXTENSIONS = [".pdf", ".docx", ".doc", ".txt", ".rtf", ".odt"];

// Media types (images/videos)
const ALLOWED_MEDIA_MIMES = ["image/", "video/"];

// ===========================
// File Filters
// ===========================

function documentFileFilter(req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype;

    // Check by extension
    if (ALLOWED_DOCUMENT_EXTENSIONS.includes(ext)) {
        cb(null, true);
        return;
    }

    // Check by MIME type
    if (ALLOWED_DOCUMENT_MIMES[mime]) {
        cb(null, true);
        return;
    }

    cb(new Error(`Unsupported file type: ${ext}. Allowed: ${ALLOWED_DOCUMENT_EXTENSIONS.join(", ")}`));
}

function mediaFileFilter(req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
    if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
        cb(null, true);
    } else {
        cb(new Error("Only image and video files are allowed!"));
    }
}

// ===========================
// Storage Configurations
// ===========================

// Temp storage for general uploads
const tempDiskStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, TEMP_UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${uuidv4().substring(0, 8)}`;
        const ext = path.extname(file.originalname);
        cb(null, `${uniqueSuffix}${ext}`);
    },
});

// Document storage for quiz files
const documentDiskStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, DOCUMENTS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${uuidv4().substring(0, 8)}`;
        const ext = path.extname(file.originalname);
        // Keep original name for reference
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_").substring(0, 50);
        cb(null, `${uniqueSuffix}-${safeName}`);
    },
});

// ===========================
// File Size Limits
// ===========================
const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024; // 50MB for documents
const MAX_MEDIA_SIZE = 50 * 1024 * 1024; // 50MB for media
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB for avatars

// ===========================
// Export Multer Instances
// ===========================

// Document upload for quiz generation
export const uploadDocument = multer({
    storage: documentDiskStorage,
    fileFilter: documentFileFilter,
    limits: { fileSize: MAX_DOCUMENT_SIZE },
}).single("document");

// General file upload (temp)
export const uploadSingle = multer({
    storage: tempDiskStorage,
    fileFilter: mediaFileFilter,
    limits: { fileSize: MAX_MEDIA_SIZE },
}).single("file");

// Multiple files upload
export const uploadMultiple = multer({
    storage: tempDiskStorage,
    fileFilter: mediaFileFilter,
    limits: { fileSize: MAX_MEDIA_SIZE, files: 10 },
}).array("files", 10);

// Avatar upload (memory storage for processing)
export const uploadAvatar = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith("image/")) cb(null, true);
        else cb(new Error("Only image files are allowed!"));
    },
    limits: { fileSize: MAX_AVATAR_SIZE },
}).single("avatar");

// ===========================
// Utility Functions
// ===========================

export function cleanupTempFile(filePath: string): void {
    if (filePath && fs.existsSync(filePath)) {
        fs.promises.unlink(filePath).catch(() => { });
    }
}

export function getDocumentsDir(): string {
    return DOCUMENTS_DIR;
}

export function getTempDir(): string {
    return TEMP_UPLOAD_DIR;
}

// Export allowed extensions for frontend validation
export const ALLOWED_EXTENSIONS = ALLOWED_DOCUMENT_EXTENSIONS;
