/**
 * Quiz Types
 * TypeScript interfaces and Zod validation schemas for Quiz API.
 */
import { z } from "zod";
import { AnswerSource, QuizStatus } from "../models/quiz.model";

// ==================== DTOs ====================

export interface QuizUploadResponse {
    quizId: string;
    message: string;
    status: QuizStatus;
}

export interface QuizStatusResponse {
    quizId: string;
    status: QuizStatus;
    totalQuestions: number;
    processedQuestions: number;
    errorMessage?: string;
}

export interface ChoiceDTO {
    key: string;
    text: string;
    isVisuallyMarked: boolean;
}

export interface QuestionDTO {
    id: string;
    stem: string;
    choices: ChoiceDTO[];
    correctAnswerKey: string;
    explanation?: string;
    source: AnswerSource;
}

export interface QuizDTO {
    id: string;
    title: string;
    documentUrl: string;
    documentType: "pdf" | "docx";
    status: QuizStatus;
    questions: QuestionDTO[];
    totalQuestions: number;
    processedQuestions: number;
    createdAt: string;
    updatedAt: string;
}

// ==================== Parsed Document Types ====================

export interface ParsedChoice {
    key: string;
    text: string;
    isVisuallyMarked: boolean;
}

export interface ParsedQuestion {
    index?: number;
    stem: string;
    choices: ParsedChoice[];
    correctAnswerKey: string;
    source: AnswerSource;
    section?: string; // Sticky Section support
}

export interface ParsedDocument {
    title: string;
    questions: ParsedQuestion[];
}

// ==================== AI Response Types ====================

export interface GeminiAnswerResponse {
    correct_key: string;
    explanation: string;
}

// ==================== Job Queue Types ====================

export interface QuizProcessingJob {
    quizId: string;
    documentUrl: string;
    documentType: "pdf" | "docx";
}

// ==================== Zod Validation Schemas ====================

export const updateQuestionSchema = z.object({
    correctAnswerKey: z.string().min(1).max(1).optional(),
    explanation: z.string().max(2000).optional(),
    source: z.nativeEnum(AnswerSource).optional(),
});

export const quizQuerySchema = z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    status: z.nativeEnum(QuizStatus).optional(),
});

export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
export type QuizQueryInput = z.infer<typeof quizQuerySchema>;
