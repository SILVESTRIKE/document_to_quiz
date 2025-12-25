/**
 * Quiz Model
 * Represents a quiz generated from document parsing with embedded questions and choices.
 */
import mongoose, { Document, Schema, Types } from "mongoose";

// Enums
export enum AnswerSource {
    StyleDetected = "StyleDetected",
    AI_Generated = "AI_Generated",
    Manual = "Manual",
}

export enum QuizStatus {
    Pending = "pending",
    Processing = "processing",
    Waiting_AI = "waiting_ai",  // Graceful postponement - waiting for AI retry
    Completed = "completed",
    Failed = "failed",
    Needs_Review = "needs_review",  // AI failed, manual review needed
}

// Interfaces
export interface IChoice {
    key: string; // A, B, C, D
    text: string;
    isVisuallyMarked: boolean;
}

export interface IQuestion {
    _id?: Types.ObjectId;
    stem: string;
    choices: IChoice[];
    correctAnswerKey: string;
    explanation?: string;
    source: AnswerSource;
    section?: string; // Section/chapter this question belongs to
}

export interface IQuiz extends Document {
    _id: Types.ObjectId;
    title: string;
    documentUrl: string; // Google Drive link or local file
    documentType: "pdf" | "docx";
    fileHash?: string; // MD5 hash for deduplication
    status: QuizStatus;
    questions: IQuestion[];
    totalQuestions: number;
    processedQuestions: number;
    sections?: string[]; // Unique section names
    sectionCounts?: { name: string; count: number }[]; // Array of section counts
    errorMessage?: string;
    debugJsonPath?: string; // Path to debug JSON file with parsed results
    createdBy: Types.ObjectId;
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}

// Schemas
const ChoiceSchema = new Schema<IChoice>(
    {
        key: { type: String, required: true },
        text: { type: String, required: true },
        isVisuallyMarked: { type: Boolean, default: false },
    },
    { _id: false }
);

const QuestionSchema = new Schema<IQuestion>(
    {
        stem: { type: String, required: true },
        choices: { type: [ChoiceSchema], default: [] },
        correctAnswerKey: { type: String, default: "" },
        explanation: { type: String },
        source: {
            type: String,
            enum: Object.values(AnswerSource),
            default: AnswerSource.StyleDetected,
        },
        section: { type: String, default: "" }, // Section/chapter
    },
    { _id: true, strict: false } // Allow new fields
);

const QuizSchema = new Schema<IQuiz>(
    {
        title: { type: String, required: true },
        documentUrl: { type: String, required: true },
        documentType: {
            type: String,
            enum: ["pdf", "docx"],
            required: true,
        },
        status: {
            type: String,
            enum: Object.values(QuizStatus),
            default: QuizStatus.Pending,
        },
        questions: { type: [QuestionSchema], default: [] },
        totalQuestions: { type: Number, default: 0 },
        processedQuestions: { type: Number, default: 0 },
        sections: { type: [String], default: [] }, // Unique section names
        sectionCounts: { type: [{ name: String, count: Number }], default: [] }, // Array of section counts
        errorMessage: { type: String },
        debugJsonPath: { type: String }, // Path to debug JSON
        fileHash: { type: String, index: true }, // MD5 hash for deduplication
        createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        isDeleted: { type: Boolean, default: false },
    },
    {
        timestamps: true,
    }
);

// Indexes
QuizSchema.index({ createdBy: 1, createdAt: -1 });
QuizSchema.index({ status: 1 });

const Quiz = mongoose.model<IQuiz>("Quiz", QuizSchema);

export default Quiz;
