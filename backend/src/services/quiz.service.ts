/**
 * Quiz Service
 * Orchestrates quiz creation, processing, and CRUD operations.
 */
import mongoose, { Types } from "mongoose";
import crypto from "crypto";
import Quiz, { IQuiz, QuizStatus } from "../models/quiz.model";
import Question from "../models/question.model";
import { driveStorage } from "../utils/storage/drive.storage";
import { addQuizProcessingJob } from "../workers/quiz.worker";
import { geminiService } from "./gemini.service";
import { NotFoundError } from "../errors";
import { logger } from "../utils/logger.util";
import { UpdateQuestionInput, QuizQueryInput } from "../types/quiz.types";
import { AnswerSource } from "../models/quiz.model";
import path from "path";
import fs from "fs/promises";
import { existsSync, createReadStream } from "fs";

export interface CreateQuizOptions {
    file: Express.Multer.File;
    title?: string;
    userId: string;
}

export interface FindQuizzesOptions extends QuizQueryInput {
    userId?: string;
}

/**
 * Calculate MD5 hash of a file using streams (non-blocking, memory efficient)
 */
async function calculateFileHashStream(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash("md5");
        const stream = createReadStream(filePath);

        stream.on("data", (chunk) => hash.update(chunk));
        stream.on("end", () => resolve(hash.digest("hex")));
        stream.on("error", (err) => reject(err));
    });
}

/**
 * Find existing file path from DB with same hash (faster than file scan)
 */
async function findDuplicateFilePath(fileHash: string): Promise<string | null> {
    const sameFileQuiz = await Quiz.findOne({ fileHash, isDeleted: false });
    if (!sameFileQuiz) return null;

    if (sameFileQuiz.documentUrl.startsWith("file://")) {
        const oldPath = sameFileQuiz.documentUrl.replace("file://", "");
        if (existsSync(oldPath)) {
            return oldPath;
        }
    }
    return null;
}

export const quizService = {
    /**
     * Create a new quiz from uploaded document
     * Implements deduplication - reuses existing files with same content
     */
    async createFromUpload(options: CreateQuizOptions): Promise<IQuiz> {
        const { file, title, userId } = options;

        // Validate file type
        const ext = path.extname(file.originalname).toLowerCase();
        const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".doc", ".txt", ".rtf", ".odt"];

        if (!SUPPORTED_EXTENSIONS.includes(ext)) {
            throw new Error(`Unsupported file type: ${ext}. Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`);
        }

        // Map extension to document type (pdf or docx-like)
        const documentType = ext === ".pdf" ? "pdf" : "docx";

        // Calculate file hash for deduplication (stream-based, non-blocking)
        const fileHash = await calculateFileHashStream(file.path);

        // Check if quiz with same hash already exists (completed)
        const existingQuiz = await Quiz.findOne({
            fileHash,
            isDeleted: false,
            status: QuizStatus.Completed
        });

        if (existingQuiz) {
            // Duplicate found - delete uploaded file and return existing quiz info
            await fs.unlink(file.path).catch(() => { });
            logger.info(`[QuizService] Dedup: Quiz already exists ${existingQuiz._id}`);

            // Return special response indicating duplicate
            return {
                ...existingQuiz.toObject(),
                isDuplicate: true,
                existingQuizId: existingQuiz._id.toString(),
            } as unknown as IQuiz & { isDuplicate: boolean; existingQuizId: string };
        }

        // Check for existing file with same content (via DB - faster)
        const existingFilePath = await findDuplicateFilePath(fileHash);

        let finalPath = file.path;
        if (existingFilePath && existingFilePath !== file.path) {
            // Duplicate file found - delete new file and use existing
            await fs.unlink(file.path).catch(() => { });
            finalPath = existingFilePath;
            logger.info(`[QuizService] Dedup: Reusing existing file ${path.basename(existingFilePath)}`);
        } else {
            logger.info(`[QuizService] New unique file: ${path.basename(file.path)}`);
        }

        const documentUrl = `file://${finalPath}`;

        // Create quiz record
        const quiz = await Quiz.create({
            title: title || file.originalname.replace(ext, ""),
            documentUrl,
            documentType,
            status: QuizStatus.Pending,
            createdBy: new Types.ObjectId(userId),
            fileHash, // Store hash for future reference
        });

        // Queue background processing
        await addQuizProcessingJob({
            quizId: quiz._id.toString(),
            documentUrl,
            documentType,
        });

        logger.info(`[QuizService] Created quiz ${quiz._id} from ${file.originalname}`);

        return quiz;
    },

    /**
     * Find quiz by ID
     */
    async findById(id: string): Promise<IQuiz | null> {
        if (!mongoose.isValidObjectId(id)) {
            return null;
        }
        return Quiz.findOne({ _id: id, isDeleted: false });
    },

    /**
     * Get quiz status
     */
    async getStatus(id: string) {
        const quiz = await this.findById(id);
        if (!quiz) {
            throw new NotFoundError("Quiz not found");
        }

        return {
            quizId: quiz._id.toString(),
            status: quiz.status,
            totalQuestions: quiz.totalQuestions,
            processedQuestions: quiz.processedQuestions,
            errorMessage: quiz.errorMessage,
        };
    },

    /**
     * Find quizzes with pagination
     */
    async findAndPaginate(options: FindQuizzesOptions) {
        const { page = 1, limit = 20, status, userId } = options;
        const filter: any = { isDeleted: false };

        if (status) filter.status = status;
        if (userId) filter.createdBy = new Types.ObjectId(userId);

        const [totalItems, data] = await Promise.all([
            Quiz.countDocuments(filter),
            Quiz.find(filter)
                .select("title status totalQuestions processedQuestions sections sectionCounts createdAt documentType fileHash")
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit),
        ]);

        return {
            data,
            pagination: {
                totalItems,
                totalPages: Math.ceil(totalItems / limit),
                currentPage: page,
                limit,
            },
        };
    },

    /**
     * Update a specific question in a quiz
     */
    async updateQuestion(
        quizId: string,
        questionId: string,
        data: UpdateQuestionInput
    ): Promise<IQuiz | null> {
        const quiz = await this.findById(quizId);
        if (!quiz) {
            throw new NotFoundError("Quiz not found");
        }

        const questionIndex = quiz.questions.findIndex(
            (q) => q._id?.toString() === questionId
        );

        if (questionIndex === -1) {
            throw new NotFoundError("Question not found");
        }

        // Update question fields
        if (data.correctAnswerKey !== undefined) {
            quiz.questions[questionIndex].correctAnswerKey = data.correctAnswerKey;
        }
        if (data.explanation !== undefined) {
            quiz.questions[questionIndex].explanation = data.explanation;
        }
        if (data.source !== undefined) {
            quiz.questions[questionIndex].source = data.source;
        }

        await quiz.save();

        logger.info(`[QuizService] Updated question ${questionId} in quiz ${quizId}`);

        return quiz;
    },

    /**
     * Soft delete a quiz
     */
    async softDelete(id: string): Promise<IQuiz | null> {
        return Quiz.findOneAndUpdate(
            { _id: id, isDeleted: false },
            { isDeleted: true },
            { new: true }
        );
    },

    /**
     * Hard delete a quiz
     */
    async hardDelete(id: string): Promise<boolean> {
        const quiz = await Quiz.findById(id);
        if (!quiz) return false;

        // Delete from Google Drive
        if (quiz.documentUrl) {
            const fileId = driveStorage.extractFileId(quiz.documentUrl);
            if (fileId) {
                await driveStorage.deleteFile(fileId);
            }
        }

        await Quiz.deleteOne({ _id: id });
        logger.info(`[QuizService] Hard deleted quiz: ${id}`);

        return true;
    },

    /**
     * Generate AI explanation when user answers incorrectly
     */
    async explainWrongAnswer(
        quizId: string,
        questionId: string,
        userAnswerKey: string
    ): Promise<{ explanation: string }> {
        const quiz = await this.findById(quizId);
        if (!quiz) {
            throw new NotFoundError("Quiz not found");
        }

        const question = quiz.questions.find(function (q) {
            return q._id?.toString() === questionId;
        });

        if (!question) {
            throw new NotFoundError("Question not found");
        }

        // If user answered correctly, no need for explanation
        if (question.correctAnswerKey === userAnswerKey) {
            return { explanation: "Chúc mừng! Bạn đã trả lời đúng." };
        }

        // Gọi AI với section context để giải thích chuyên sâu hơn
        const explanation = await geminiService.generateWrongAnswerExplanation({
            questionStem: question.stem,
            choices: question.choices.map(function (c) {
                return {
                    key: c.key,
                    text: c.text,
                };
            }),
            correctAnswerKey: question.correctAnswerKey,
            userAnswerKey: userAnswerKey,
            section: question.section, // Truyền Section để AI giải thích theo ngữ cảnh
        });

        logger.info(`[QuizService] Generated explanation for question ${questionId}`);

        return { explanation };
    },

    /**
     * Debug parse file and return raw JSON (no database save)
     */
    async debugParseFile(file: Express.Multer.File) {
        const uploadsDir = path.join(__dirname, "..", "..", "uploads", "documents");

        const { documentService } = await import("./document.service");

        const ext = path.extname(file.originalname).toLowerCase();
        let parsed;

        if (ext === ".pdf") {
            parsed = await documentService.parsePdf(file.path);
        } else if (ext === ".docx") {
            parsed = await documentService.parseDocx(file.path);
        } else {
            throw new Error("Unsupported file type");
        }

        // Clean up file after parsing
        if (existsSync(file.path)) {
            await fs.unlink(file.path);
        }

        // Format output for debugging
        const debugOutput = {
            fileName: file.originalname,
            title: parsed.title,
            totalQuestions: parsed.questions.length,
            questionsWithAnswer: parsed.questions.filter(function (q) {
                return q.correctAnswerKey;
            }).length,
            questionsNeedAI: parsed.questions.filter(function (q) {
                return !q.correctAnswerKey;
            }).length,
            questions: parsed.questions.map(function (q, idx) {
                return {
                    index: idx + 1,
                    stem: q.stem.substring(0, 150) + (q.stem.length > 150 ? "..." : ""),
                    fullStem: q.stem,
                    choices: q.choices.map(function (c) {
                        return {
                            key: c.key,
                            text: c.text.substring(0, 100) + (c.text.length > 100 ? "..." : ""),
                            fullText: c.text,
                            isMarked: c.isVisuallyMarked,
                        };
                    }),
                    correctAnswerKey: q.correctAnswerKey || "(cần AI)",
                    source: q.source,
                    choiceCount: q.choices.length,
                    hasIssue: q.choices.length < 2 || q.choices.length > 6,
                };
            }),
        };

        // Also save to file for easier viewing
        const debugFilePath = path.join(uploadsDir, `debug_${Date.now()}.json`);
        await fs.writeFile(debugFilePath, JSON.stringify(debugOutput, null, 2), "utf-8");

        return {
            ...debugOutput,
            debugFileSaved: debugFilePath,
        };
    },
};
