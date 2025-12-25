/**
 * Question Model (Separate Collection)
 * Extracted from Quiz for better performance and scalability.
 * Avoids MongoDB 16MB document limit for quizzes with many questions.
 */
import mongoose, { Document, Schema, Types } from "mongoose";
import { AnswerSource } from "./quiz.model";

export interface IChoice {
    key: string; // A, B, C, D
    text: string;
    isVisuallyMarked?: boolean;
}

export interface IQuestionDoc extends Document {
    _id: Types.ObjectId;
    quizId: Types.ObjectId;
    index: number; // Question order within quiz
    stem: string;
    choices: IChoice[];
    correctAnswerKey: string;
    explanation?: string;
    aiExplanation?: string; // On-demand AI explanation
    source: AnswerSource;
    section?: string;
    createdAt: Date;
    updatedAt: Date;
}

const ChoiceSchema = new Schema<IChoice>(
    {
        key: { type: String, required: true },
        text: { type: String, required: true },
        isVisuallyMarked: { type: Boolean, default: false },
    },
    { _id: false }
);

const QuestionSchema = new Schema<IQuestionDoc>(
    {
        quizId: {
            type: Schema.Types.ObjectId,
            ref: "Quiz",
            required: true,
            index: true
        },
        index: { type: Number, required: true },
        stem: { type: String, required: true },
        choices: { type: [ChoiceSchema], default: [] },
        correctAnswerKey: { type: String, default: "" },
        explanation: { type: String },
        aiExplanation: { type: String },
        source: {
            type: String,
            enum: Object.values(AnswerSource),
            default: AnswerSource.AI_Generated,
        },
        section: { type: String, default: "" },
    },
    { timestamps: true }
);

// Compound index for efficient quiz question queries
QuestionSchema.index({ quizId: 1, index: 1 });
QuestionSchema.index({ quizId: 1, section: 1 });

const Question = mongoose.model<IQuestionDoc>("Question", QuestionSchema);

export default Question;
