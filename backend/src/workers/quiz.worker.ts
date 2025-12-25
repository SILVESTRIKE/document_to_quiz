/**
 * Quiz Worker
 * BullMQ worker for background document processing and AI answer detection.
 * Uses 5-layer AI fallback with semantic caching.
 */
import { Queue, Worker, Job } from "bullmq";
import { QuizProcessingJob, ParsedQuestion, ParsedChoice } from "../types/quiz.types";
import { QuestionInput } from "../types/ai.types";
import Quiz, { AnswerSource, QuizStatus } from "../models/quiz.model";
import { driveStorage } from "../utils/storage/drive.storage";
import { documentService } from "../services/document.service";
import { aiOrchestrator } from "../services/ai/aiOrchestrator.service";
import { logger } from "../utils/logger.util";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import os from "os";

const QUEUE_NAME = "quiz-processing";

// Queue instance
let quizQueue: Queue | null = null;

/**
 * Get or create quiz processing queue
 */
export function getQuizQueue(): Queue {
    if (!quizQueue) {
        quizQueue = new Queue(QUEUE_NAME, {
            connection: {
                host: process.env.REDIS_HOST || "localhost",
                port: parseInt(process.env.REDIS_PORT || "6379"),
            },
        });
    }
    return quizQueue;
}

/**
 * Add a quiz processing job to the queue
 */
export async function addQuizProcessingJob(job: QuizProcessingJob): Promise<string> {
    const queue = getQuizQueue();
    const added = await queue.add("process-quiz", job, {
        // Auto-retry for graceful postponement
        attempts: 3,
        backoff: {
            type: "fixed",
            delay: 5 * 60 * 1000, // 5 minutes between retries
        },
        removeOnComplete: true,
        removeOnFail: false,
    });

    logger.info(`[QuizWorker] Added job ${added.id} for quiz ${job.quizId}`);
    return added.id || "";
}

async function processQuizDocument(job: Job): Promise<void> {
    const { quizId, documentUrl, documentType } = job.data;
    try {
        await Quiz.findByIdAndUpdate(quizId, { status: QuizStatus.Processing });

        // 1. Parse document using generic parser (supports pdf, docx, doc, txt, rtf, odt)
        const tempPath = documentUrl.replace("file://", "");
        let parsedDoc: any = await documentService.parseGenericDocument(tempPath);

        // 2. Prepare questions for AI orchestrator
        const questionsForAI: QuestionInput[] = parsedDoc.questions.map(function (q: ParsedQuestion, idx: number) {
            return {
                index: idx + 1,
                stem: q.stem,
                choices: q.choices.map(function (c: ParsedChoice) { return { key: c.key, text: c.text }; }),
                section: q.section || ""
            };
        });

        logger.info(`[QuizWorker] Dispatching ${questionsForAI.length} questions to AI Orchestrator`);

        // 3. Call AI Orchestrator (5-layer fallback with caching)
        const aiResult = await aiOrchestrator.solveQuestions(questionsForAI);

        logger.info(`[QuizWorker] AI Result: ${aiResult.cacheHits} cache hits, ${aiResult.cacheMisses} AI calls, ${aiResult.failedQuestions} failed`);

        // Helper to normalize section labels and extract MAJOR section only
        // CLO1.1, CLO1.2, CLO1.3 -> CLO 1
        // Chương 2.1, Chương 2.2 -> Chương 2
        function sanitizeSection(raw: string): string {
            let s = raw.trim().toUpperCase();

            // 1. Fix duplicate words: CLCLO -> CLO, CLO CLO -> CLO
            s = s.replace(/^(CL)+CLO/i, "CLO");
            s = s.replace(/^CLO\s+CLO/i, "CLO");

            // 2. Extract MAJOR section only (Letters + First Number)
            // Examples: "CLO 1.1.2" -> "CLO 1", "CLO1.2" -> "CLO 1", "Chương 2.3" -> "CHƯƠNG 2"
            const majorMatch = s.match(/^([A-ZÀ-Ỹ]+\s*\d+)/i);
            if (majorMatch) {
                s = majorMatch[1];
            }

            // 3. Normalize spacing: "CLO1" -> "CLO 1", "CHƯƠNG2" -> "CHƯƠNG 2"
            s = s.replace(/^([A-ZÀ-Ỹ]+)(\d+)$/i, "$1 $2");

            return s.trim() || "Nội dung chung";
        }

        // 4. Map AI results to final questions (với section đã sanitize)
        // Create a map for quick lookup of AI responses by index
        const aiResponseMap = new Map(aiResult.responses.map(function (r) { return [r.index, r]; }));

        // Track missed questions for validation
        let missedCount = 0;

        const finalQuestions = parsedDoc.questions.map(function (q: ParsedQuestion, idx: number) {
            const sanitizedSection = sanitizeSection(q.section || "");
            // ANCHOR: Always use parser index as source of truth
            const parserIndex = idx + 1;
            const aiResponse = aiResponseMap.get(parserIndex);

            // Check if Visual Mark already detected correct answer (DOCX with bold/highlight)
            const hasVisualMark = q.correctAnswerKey && q.correctAnswerKey.length > 0;

            // Validation: log warning if AI missed this question
            if (!aiResponse && !hasVisualMark) {
                missedCount++;
                logger.warn(`[QuizWorker] AI missed question ${parserIndex}: "${q.stem.substring(0, 50)}..."`);
            }

            return {
                stem: q.stem,
                choices: q.choices,
                // Priority: Visual Mark > AI > Fallback "A"
                correctAnswerKey: hasVisualMark
                    ? q.correctAnswerKey
                    : (aiResponse?.correctKey?.toUpperCase() || "A"),
                explanation: aiResponse?.explanation || "",
                source: hasVisualMark
                    ? AnswerSource.StyleDetected
                    : (aiResponse ? AnswerSource.AI_Generated : AnswerSource.AI_Generated),
                section: sanitizedSection
            };
        });

        if (missedCount > 0) {
            logger.warn(`[QuizWorker] Total ${missedCount} questions missed by AI, using fallback "A"`);
        }

        // Memory cleanup: Free large objects immediately
        parsedDoc = null;
        if (typeof (global as any).gc === "function") {
            (global as any).gc();
            logger.info(`[QuizWorker] Memory cleanup done for Quiz ${quizId}`);
        }

        // DEBUG: Log first 3 questions with their sections
        logger.info(`[QuizWorker] DEBUG - First 3 questions sections:`,
            finalQuestions.slice(0, 3).map(function (q: any) { return { stem: q.stem.substring(0, 30), section: q.section }; })
        );

        // 5. Count questions per section
        const tempCounts: Record<string, number> = {};
        finalQuestions.forEach(function (q: any) {
            tempCounts[q.section] = (tempCounts[q.section] || 0) + 1;
        });

        // Convert to array format (to avoid MongoDB dot-key issues)
        const sections = Object.keys(tempCounts);
        const sectionCounts = sections.map(function (name) {
            return { name, count: tempCounts[name] };
        });

        logger.info(`[QuizWorker] DEBUG - Sections to save: ${JSON.stringify(sections)}`);
        logger.info(`[QuizWorker] DEBUG - SectionCounts: ${JSON.stringify(sectionCounts)}`);

        // Use findById + save instead of findByIdAndUpdate to ensure subdocuments are properly saved
        const quiz = await Quiz.findById(quizId);
        if (quiz) {
            quiz.questions = finalQuestions as any;
            quiz.totalQuestions = finalQuestions.length;
            quiz.processedQuestions = finalQuestions.length;
            quiz.sections = sections;
            quiz.sectionCounts = sectionCounts;
            quiz.status = QuizStatus.Completed;
            await quiz.save();

            // 6. Upload to Google Drive (optional - if credentials configured)
            if (process.env.GOOGLE_DRIVE_CLIENT_EMAIL && process.env.GOOGLE_DRIVE_FOLDER_ID) {
                try {
                    const fileName = path.basename(tempPath);
                    const mimeType = documentType === "docx"
                        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        : "application/pdf";

                    const { webViewLink } = await driveStorage.uploadFile(tempPath, fileName, mimeType);

                    // Update quiz with Drive URL
                    quiz.documentUrl = webViewLink;
                    await quiz.save();

                    // Delete local file after successful upload
                    if (existsSync(tempPath)) {
                        await fs.unlink(tempPath).catch(() => { });
                        logger.info(`[QuizWorker] Uploaded to Drive & deleted local: ${fileName}`);
                    }
                } catch (driveError: any) {
                    logger.warn(`[QuizWorker] Drive upload failed (keeping local): ${driveError.message}`);
                }
            }
        }

        logger.info(`[QuizWorker] Completed quiz ${quizId} with ${sections.length} sections.`);

    } catch (error: any) {
        const errorMsg = error?.message || String(error);
        logger.error(`[QuizWorker] Worker failed: ${errorMsg}`);

        // Delete quiz record and uploaded file to keep server clean
        try {
            const tempPath = documentUrl.replace("file://", "");
            if (existsSync(tempPath)) {
                await fs.unlink(tempPath).catch(() => { });
                logger.info(`[QuizWorker] Deleted file: ${tempPath}`);
            }
            await Quiz.findByIdAndDelete(quizId);
            logger.info(`[QuizWorker] Deleted failed quiz: ${quizId}`);
        } catch (cleanupError) {
            logger.error(`[QuizWorker] Cleanup failed:`, cleanupError);
        }
    }
}

/**
 * Start the quiz processing worker
 */
export function startQuizWorker(): Worker {
    // Use concurrency 1 to avoid hitting Gemini rate limits
    const concurrency = parseInt(process.env.BULLMQ_QUIZ_CONCURRENCY || "1");

    const worker = new Worker(QUEUE_NAME, processQuizDocument, {
        connection: {
            host: process.env.REDIS_HOST || "localhost",
            port: parseInt(process.env.REDIS_PORT || "6379"),
        },
        concurrency,
        limiter: {
            max: 5,
            duration: 60000, // 5 jobs per minute max
        },
        autorun: true,
    });

    worker.on("completed", function (job: Job) {
        logger.info(`[QuizWorker] Job ${job.id} completed`);
    });

    worker.on("failed", function (job: Job | undefined, error: Error) {
        logger.error(`[QuizWorker] Job ${job?.id} failed:`, error);
    });

    logger.info(`[QuizWorker] Started with concurrency ${concurrency}`);

    return worker;
}
