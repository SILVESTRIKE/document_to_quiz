/**
 * Feedback Model
 */
import mongoose, { Document, Schema } from "mongoose";

export type FeedbackStatus = "pending_review" | "approved" | "rejected";

export interface IFeedback extends Document {
    userId: mongoose.Types.ObjectId;
    referenceId?: mongoose.Types.ObjectId;
    referenceType?: string;
    content: string;
    rating?: number;
    status: FeedbackStatus;
    adminId?: mongoose.Types.ObjectId;
    adminNotes?: string;
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const feedbackSchema = new Schema<IFeedback>(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        referenceId: { type: Schema.Types.ObjectId },
        referenceType: String,
        content: { type: String, required: true, maxlength: 2000 },
        rating: { type: Number, min: 1, max: 5 },
        status: { type: String, enum: ["pending_review", "approved", "rejected"], default: "pending_review" },
        adminId: { type: Schema.Types.ObjectId, ref: "User" },
        adminNotes: { type: String, maxlength: 1000 },
        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true }
);

feedbackSchema.index({ userId: 1 });
feedbackSchema.index({ status: 1 });
feedbackSchema.index({ referenceId: 1, referenceType: 1 });

export default mongoose.model<IFeedback>("Feedback", feedbackSchema);
