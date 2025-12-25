/**
 * AI Trace Model
 * Logs AI input/output for debugging and auditing failed jobs.
 * Uses TTL index for automatic cleanup after 7 days.
 */
import mongoose, { Document, Schema, Types } from "mongoose";

export interface IAiTrace extends Document {
    _id: Types.ObjectId;
    quizId?: Types.ObjectId;
    jobId?: string;
    aiModel: string; // gemini-flash, deepseek-r1, etc.
    provider: "gemini" | "huggingface" | "ollama";
    inputPrompt: string; // Truncated to save space
    outputRaw: string; // Raw AI response
    parsedResult?: any; // Parsed JSON if successful
    error?: string;
    durationMs: number;
    tokenCount?: number;
    success: boolean;
    createdAt: Date;
}

const AiTraceSchema = new Schema<IAiTrace>(
    {
        quizId: { type: Schema.Types.ObjectId, ref: "Quiz", index: true },
        jobId: { type: String },
        aiModel: { type: String, required: true },
        provider: {
            type: String,
            enum: ["gemini", "huggingface", "ollama"],
            required: true
        },
        inputPrompt: { type: String, required: true },
        outputRaw: { type: String },
        parsedResult: { type: Schema.Types.Mixed },
        error: { type: String },
        durationMs: { type: Number, required: true },
        tokenCount: { type: Number },
        success: { type: Boolean, required: true },
    },
    { timestamps: true }
);

// TTL index: auto-delete after 7 days
AiTraceSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 });

// Index for querying failed traces
AiTraceSchema.index({ success: 1, createdAt: -1 });

const AiTrace = mongoose.model<IAiTrace>("AiTrace", AiTraceSchema);

export default AiTrace;
