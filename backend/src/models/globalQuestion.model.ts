/**
 * GlobalQuestion Model
 * Semantic cache for quiz questions - prevents duplicate AI calls.
 * Questions are hashed after normalization for high cache hit rate.
 */
import mongoose, { Document, Schema, Types } from "mongoose";

// ==================== Interface ====================

export interface IGlobalQuestion extends Document {
    _id: Types.ObjectId;
    stemHash: string;           // MD5 of normalized stem
    stemPreview: string;        // First 100 chars for debugging
    choicesHash: string;        // MD5 of normalized choices (for exact match)
    correctKey: string;         // A, B, C, D
    explanation?: string;       // AI-generated explanation
    confidence?: number;        // AI confidence score (0-1)
    provider: string;           // Which AI provider answered
    hitCount: number;           // Cache efficiency tracking
    lastHitAt?: Date;           // Last time this was used
    createdAt: Date;
    updatedAt: Date;
}

// ==================== Schema ====================

const GlobalQuestionSchema = new Schema<IGlobalQuestion>(
    {
        stemHash: {
            type: String,
            required: true,
            index: true,
        },
        stemPreview: {
            type: String,
            required: true,
            maxlength: 150,
        },
        choicesHash: {
            type: String,
            required: true,
        },
        correctKey: {
            type: String,
            required: true,
            enum: ["A", "B", "C", "D"],
        },
        explanation: {
            type: String,
            default: "",
        },
        confidence: {
            type: Number,
            min: 0,
            max: 1,
        },
        provider: {
            type: String,
            required: true,
            enum: ["Gemini", "GitHub", "Groq", "HuggingFace", "Ollama", "Manual"],
        },
        hitCount: {
            type: Number,
            default: 0,
        },
        lastHitAt: {
            type: Date,
        },
    },
    {
        timestamps: true,
        collection: "global_questions",
    }
);

// Compound index for exact question matching
GlobalQuestionSchema.index({ stemHash: 1, choicesHash: 1 }, { unique: true });

// ==================== Normalization Helpers ====================

/**
 * Normalize stem for consistent hashing
 * - Lowercase
 * - Remove all whitespace
 * - Remove question number prefixes (Câu 1, 1., a., etc.)
 */
export function normalizeStem(stem: string): string {
    return stem
        .toLowerCase()
        // Remove Vietnamese question prefixes
        .replace(/^câu\s*\d+[\.:]/gi, "")
        // Remove numbered prefixes (1., 1), a., a))
        .replace(/^\d+[\.\)]\s*/gi, "")
        .replace(/^[a-z][\.\)]\s*/gi, "")
        // Remove all whitespace and special chars
        .replace(/\s+/g, "")
        .replace(/[^\p{L}\p{N}]/gu, "") // Keep only letters and numbers (Unicode)
        .trim();
}

/**
 * Normalize choices for hashing
 * Concatenate all choice texts, normalized
 */
export function normalizeChoices(choices: Array<{ key: string; text: string }>): string {
    return choices
        .sort((a, b) => a.key.localeCompare(b.key))
        .map(c => c.text.toLowerCase().replace(/\s+/g, ""))
        .join("|");
}

/**
 * Generate MD5 hash
 */
import crypto from "crypto";

export function hashString(input: string): string {
    return crypto.createHash("md5").update(input).digest("hex");
}

// ==================== Model ====================

const GlobalQuestion = mongoose.model<IGlobalQuestion>("GlobalQuestion", GlobalQuestionSchema);

export default GlobalQuestion;
