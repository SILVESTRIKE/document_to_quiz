/**
 * AI Orchestrator Service
 * Manages the 5-layer AI fallback system with semantic caching.
 * 
 * Layers:
 * 0. Cache (GlobalQuestions) - Free, instant
 * 1. Gemini 1.5 Flash - Primary, high batch
 * 2. GitHub Models - Stable backup
 * 3. Groq Cloud - Fast inference
 * 4. HuggingFace - Last resort
 * 5. Graceful Postponement - Auto-retry later
 */
import GlobalQuestion, {
    normalizeStem,
    normalizeChoices,
    hashString
} from "../../models/globalQuestion.model";
import {
    geminiProvider,
    githubProvider,
    groqProvider,
    huggingFaceProvider
} from "./providers";
import {
    QuestionInput,
    AIResponse,
    OrchestratorResult,
    OrchestratorOptions,
    AIProviderName,
    BatchResult
} from "../../types/ai.types";
import { logger } from "../../utils/logger.util";

// ==================== Types ====================

interface CachedAnswer {
    index: number;
    correctKey: string;
    explanation?: string;
    provider: "Cache";
}

// ==================== Orchestrator ====================

export const aiOrchestrator = {
    /**
     * Solve questions using 5-layer fallback
     */
    async solveQuestions(
        questions: QuestionInput[],
        options: OrchestratorOptions = {}
    ): Promise<OrchestratorResult> {
        const startTime = Date.now();
        const { enableCache = true, maxRetries = 2 } = options;

        const result: OrchestratorResult = {
            responses: [],
            providersUsed: [],
            totalTokens: 0,
            cacheHits: 0,
            cacheMisses: 0,
            failedQuestions: 0,
            duration: 0,
        };

        // Step 1: Check cache for all questions
        let uncachedQuestions: QuestionInput[] = [];
        const cachedAnswers: Map<number, CachedAnswer> = new Map();

        if (enableCache) {
            for (const q of questions) {
                const cached = await this.checkCache(q);
                if (cached) {
                    cachedAnswers.set(q.index, cached);
                    result.cacheHits++;
                } else {
                    uncachedQuestions.push(q);
                    result.cacheMisses++;
                }
            }

            if (cachedAnswers.size > 0) {
                result.providersUsed.push("Cache");
                logger.info(`[AI Orchestrator] Cache hits: ${cachedAnswers.size}/${questions.length}`);
            }
        } else {
            uncachedQuestions = questions;
            result.cacheMisses = questions.length;
        }

        // Step 2: Call AI providers for uncached questions (with chunking)
        if (uncachedQuestions.length > 0) {
            // CHUNKING: Split into batches of 30 to avoid prompt length issues
            const BATCH_SIZE = 30;
            const chunks: QuestionInput[][] = [];
            for (let i = 0; i < uncachedQuestions.length; i += BATCH_SIZE) {
                chunks.push(uncachedQuestions.slice(i, i + BATCH_SIZE));
            }

            logger.info(`[AI Orchestrator] Processing ${uncachedQuestions.length} questions in ${chunks.length} batches`);

            for (const chunk of chunks) {
                const aiResult = await this.callProvidersWithFallback(chunk, maxRetries);

                result.providersUsed.push(...aiResult.providersUsed.filter(function (p) { return !result.providersUsed.includes(p); }));
                result.totalTokens += aiResult.totalTokens;
                result.failedQuestions += aiResult.failedQuestions;

                // Save new answers to cache
                if (enableCache && aiResult.responses.length > 0) {
                    await this.saveToCache(chunk, aiResult.responses, aiResult.providersUsed[0] || "Gemini");
                }

                // Merge AI responses
                for (const resp of aiResult.responses) {
                    result.responses.push(resp);
                }
            }
        }

        // Step 3: Add cached answers to responses
        for (const [index, cached] of cachedAnswers) {
            result.responses.push({
                index,
                correctKey: cached.correctKey,
                explanation: cached.explanation,
            });
        }

        // Sort by index
        result.responses.sort((a, b) => a.index - b.index);
        result.duration = Date.now() - startTime;

        logger.info(`[AI Orchestrator] Complete: ${result.responses.length} answers | Cache: ${result.cacheHits} | AI: ${result.cacheMisses} | Failed: ${result.failedQuestions} | ${result.duration}ms`);

        return result;
    },

    /**
     * Check cache for a single question
     */
    async checkCache(question: QuestionInput): Promise<CachedAnswer | null> {
        try {
            const stemHash = hashString(normalizeStem(question.stem));
            const choicesHash = hashString(normalizeChoices(question.choices));

            const cached = await GlobalQuestion.findOne({ stemHash, choicesHash });

            if (cached) {
                // Update hit count
                await GlobalQuestion.updateOne(
                    { _id: cached._id },
                    { $inc: { hitCount: 1 }, $set: { lastHitAt: new Date() } }
                );

                return {
                    index: question.index,
                    correctKey: cached.correctKey,
                    explanation: cached.explanation,
                    provider: "Cache",
                };
            }

            return null;
        } catch (error) {
            logger.error(`[AI Orchestrator] Cache check error:`, error);
            return null;
        }
    },

    /**
     * Save answers to cache
     */
    async saveToCache(
        questions: QuestionInput[],
        responses: AIResponse[],
        provider: AIProviderName
    ): Promise<void> {
        const operations = [];

        for (const resp of responses) {
            const question = questions.find(q => q.index === resp.index);
            if (!question) continue;

            const stemHash = hashString(normalizeStem(question.stem));
            const choicesHash = hashString(normalizeChoices(question.choices));
            const stemPreview = question.stem.substring(0, 100);

            operations.push({
                updateOne: {
                    filter: { stemHash, choicesHash },
                    update: {
                        $setOnInsert: {
                            stemHash,
                            stemPreview,
                            choicesHash,
                            correctKey: resp.correctKey,
                            explanation: resp.explanation || "",
                            provider,
                            hitCount: 0,
                        }
                    },
                    upsert: true,
                }
            });
        }

        if (operations.length > 0) {
            try {
                await GlobalQuestion.bulkWrite(operations);
                logger.info(`[AI Orchestrator] Cached ${operations.length} new answers`);
            } catch (error) {
                logger.error(`[AI Orchestrator] Cache save error:`, error);
            }
        }
    },

    /**
     * Call providers in priority order with fallback
     */
    async callProvidersWithFallback(
        questions: QuestionInput[],
        maxRetries: number
    ): Promise<{ responses: AIResponse[]; providersUsed: AIProviderName[]; totalTokens: number; failedQuestions: number }> {
        const providers = [
            geminiProvider,
            githubProvider,
            groqProvider,
            huggingFaceProvider,
        ];

        let responses: AIResponse[] = [];
        const providersUsed: AIProviderName[] = [];
        let totalTokens = 0;
        let remainingQuestions = [...questions];

        for (const provider of providers) {
            if (remainingQuestions.length === 0) break;

            const isAvailable = await provider.isAvailable();
            if (!isAvailable) {
                logger.debug(`[AI Orchestrator] ${provider.name} not available, skipping`);
                continue;
            }

            logger.info(`[AI Orchestrator] Trying ${provider.name} for ${remainingQuestions.length} questions`);

            let retries = 0;
            while (retries < maxRetries && remainingQuestions.length > 0) {
                const result = await provider.solveBatch(remainingQuestions);

                if (result.questionsAnswered > 0) {
                    responses.push(...result.responses);
                    providersUsed.push(provider.name);
                    totalTokens += result.tokensUsed;

                    // Remove answered questions from remaining
                    const answeredIndices = new Set(result.responses.map(r => r.index));
                    remainingQuestions = remainingQuestions.filter(q => !answeredIndices.has(q.index));
                    break;
                }

                // Check if rate limited
                const status = provider.getRateLimitStatus?.();
                if (status && status.remaining === 0) {
                    logger.warn(`[AI Orchestrator] ${provider.name} rate limited, moving to next provider`);
                    break;
                }

                retries++;
                if (retries < maxRetries) {
                    await new Promise(r => setTimeout(r, 1000 * retries)); // Exponential backoff
                }
            }
        }

        return {
            responses,
            providersUsed,
            totalTokens,
            failedQuestions: remainingQuestions.length,
        };
    },

    /**
     * Get cache statistics
     */
    async getCacheStats(): Promise<{ totalCached: number; totalHits: number }> {
        const stats = await GlobalQuestion.aggregate([
            {
                $group: {
                    _id: null,
                    totalCached: { $sum: 1 },
                    totalHits: { $sum: "$hitCount" },
                }
            }
        ]);

        return stats[0] || { totalCached: 0, totalHits: 0 };
    }
};
