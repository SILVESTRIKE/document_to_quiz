/**
 * Quiz Upload Middleware
 * Handles file upload configuration for quiz documents.
 */
import multer from "multer";
import path from "path";
import fs from "fs";

// Configure uploads directory
const uploadsDir = path.join(__dirname, "..", "..", "uploads", "documents");
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.originalname}`;
        cb(null, uniqueName);
    },
});

const quizDocumentUpload = multer({
    storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
    },
    fileFilter: function (req, file, cb) {
        const allowedTypes = [
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only PDF and DOCX files are allowed"));
        }
    },
});

export const uploadQuizDocument = quizDocumentUpload.single("file");
export { uploadsDir };
