/**
 * Quiz Controller
 * Handles HTTP request/response and error catching for quiz endpoints.
 */
import { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import { quizService } from "../services/quiz.service";
import { updateQuestionSchema, quizQuerySchema } from "../types/quiz.types";
import { AnswerSource } from "../models/quiz.model";
import { validateFileMagicBytes, isDangerousFileType } from "../utils/fileValidator.util";

export const quizController = {
    /**
     * Upload document to create quiz
     */
    async uploadQuiz(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.file) {
                res.status(400).json({ error: "No file uploaded" });
                return;
            }

            // Validate magic bytes to prevent malicious file uploads
            const validation = validateFileMagicBytes(req.file.path, req.file.mimetype);
            if (!validation.isValid) {
                // Delete the suspicious file
                if (fs.existsSync(req.file.path)) {
                    fs.unlinkSync(req.file.path);
                }

                // Check for dangerous file types
                if (isDangerousFileType(validation.detectedType)) {
                    res.status(400).json({
                        error: "Potentially dangerous file detected. Upload rejected.",
                        code: "DANGEROUS_FILE"
                    });
                    return;
                }

                res.status(400).json({
                    error: validation.error || "Invalid file type",
                    code: "INVALID_FILE_TYPE"
                });
                return;
            }

            const quiz = await quizService.createFromUpload({
                file: req.file,
                title: req.body.title,
                userId: req.user!.id,
            });

            // Check if this is a duplicate redirect
            const quizAny = quiz as any;
            if (quizAny.isDuplicate) {
                res.status(200).json({
                    isDuplicate: true,
                    existingQuizId: quizAny.existingQuizId,
                    message: "File này đã được upload trước đó. Đang chuyển đến bài quiz hiện có.",
                });
                return;
            }

            res.status(201).json({
                quizId: quiz._id.toString(),
                message: "Document uploaded. Processing started.",
                status: quiz.status,
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * Get quiz processing status
     */
    async getQuizStatus(req: Request, res: Response, next: NextFunction) {
        try {
            const status = await quizService.getStatus(req.params.id);
            res.json(status);
        } catch (error) {
            next(error);
        }
    },

    /**
     * Get full quiz with questions
     */
    async getQuiz(req: Request, res: Response, next: NextFunction) {
        try {
            const quiz = await quizService.findById(req.params.id);
            if (!quiz) {
                res.status(404).json({ error: "Quiz not found" });
                return;
            }

            res.json({
                id: quiz._id.toString(),
                title: quiz.title,
                documentUrl: quiz.documentUrl,
                documentType: quiz.documentType,
                status: quiz.status,
                questions: quiz.questions.map(function (q) {
                    return {
                        id: q._id?.toString(),
                        stem: q.stem,
                        choices: q.choices,
                        correctAnswerKey: q.correctAnswerKey,
                        explanation: q.explanation,
                        source: q.source,
                        section: q.section || "", // Include section for filtering
                    };
                }),
                totalQuestions: quiz.totalQuestions,
                processedQuestions: quiz.processedQuestions,
                debugJsonPath: quiz.debugJsonPath,
                createdAt: quiz.createdAt.toISOString(),
                updatedAt: quiz.updatedAt.toISOString(),
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * List quizzes with pagination
     * Always shows all quizzes (public)
     */
    async listQuizzes(req: Request, res: Response, next: NextFunction) {
        try {
            const query = quizQuerySchema.parse(req.query);
            const result = await quizService.findAndPaginate(query);

            res.json(result);
        } catch (error) {
            next(error);
        }
    },

    /**
     * Update a specific question
     */
    async updateQuestion(req: Request, res: Response, next: NextFunction) {
        try {
            const data = updateQuestionSchema.parse(req.body);
            data.source = AnswerSource.Manual;

            const quiz = await quizService.updateQuestion(
                req.params.id,
                req.params.qid,
                data
            );

            if (!quiz) {
                res.status(404).json({ error: "Quiz or question not found" });
                return;
            }

            res.json({ message: "Question updated successfully" });
        } catch (error) {
            next(error);
        }
    },

    /**
     * Delete a quiz (owner only)
     */
    async deleteQuiz(req: Request, res: Response, next: NextFunction) {
        try {
            // First find the quiz to check ownership
            const quiz = await quizService.findById(req.params.id);
            if (!quiz) {
                res.status(404).json({ error: "Quiz not found" });
                return;
            }

            // Check ownership - only creator can delete
            if (quiz.createdBy.toString() !== req.user!.id) {
                res.status(403).json({ error: "Unauthorized - bạn không phải chủ sở hữu quiz này" });
                return;
            }

            // Now safe to delete
            await quizService.softDelete(req.params.id);
            res.json({ message: "Quiz deleted successfully" });
        } catch (error) {
            next(error);
        }
    },

    /**
     * Debug endpoint - Parse file and return raw JSON
     */
    async debugParse(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.file) {
                res.status(400).json({ error: "No file uploaded" });
                return;
            }

            const result = await quizService.debugParseFile(req.file);
            res.json(result);
        } catch (error) {
            next(error);
        }
    },

    /**
     * Get AI explanation when user answers incorrectly
     */
    async explainWrongAnswer(req: Request, res: Response, next: NextFunction) {
        try {
            const { userAnswerKey } = req.body;

            if (!userAnswerKey) {
                res.status(400).json({ error: "userAnswerKey is required" });
                return;
            }

            const result = await quizService.explainWrongAnswer(
                req.params.id,
                req.params.qid,
                userAnswerKey
            );

            res.json(result);
        } catch (error) {
            next(error);
        }
    },

    /**
     * Download quiz as DOCX with highlighted correct answers
     */
    async downloadHighlightedDoc(req: Request, res: Response, next: NextFunction) {
        try {
            const { documentService } = await import("../services/document.service");

            const quiz = await quizService.findById(req.params.id);
            if (!quiz) {
                res.status(404).json({ error: "Quiz not found" });
                return;
            }

            if (quiz.status !== "completed") {
                res.status(400).json({ error: "Quiz is not yet completed" });
                return;
            }

            const buffer = await documentService.generateHighlightedDocx(quiz);
            const fileName = `${quiz.title || "quiz"}_answers.docx`;

            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
            res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
            res.send(buffer);
        } catch (error) {
            next(error);
        }
    },
};
