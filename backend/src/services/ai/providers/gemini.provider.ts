/**
 * Gemini AI Provider (Primary - Layer 1)
 * Uses Google's Gemini 1.5 Flash for high-volume batch processing.
 * - 1M tokens/minute
 * - Batch size: 30-50 questions
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { BaseProvider } from "./base.provider";
import { AIProviderName, BatchResult, QuestionInput } from "../../../types/ai.types";
import { logger } from "../../../utils/logger.util";

export class GeminiProvider extends BaseProvider {
    name: AIProviderName = "Gemini";
    priority = 1;

    private maxBatchSize = 40;

    constructor() {
        const keys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
        super(keys);
    }

    async solveBatch(questions: QuestionInput[]): Promise<BatchResult> {
        const startTime = Date.now();
        const apiKey = this.getNextApiKey();

        if (!apiKey) {
            return {
                responses: [],
                provider: this.name,
                tokensUsed: 0,
                duration: 0,
                questionsAnswered: 0,
                questionsFailed: questions.length,
            };
        }

        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
                model: "gemini-1.5-flash",
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 2048,
                    responseMimeType: "application/json", // Enable JSON mode
                }
            });

            const prompt = this.buildPrompt(questions);
            const result = await model.generateContent(prompt);
            const content = result.response.text();

            // Get token usage
            const tokensUsed = result.response.usageMetadata?.totalTokenCount || 0;
            const duration = Date.now() - startTime;

            const responses = this.parseResponse(content, questions);

            this.logTokenUsage(tokensUsed, questions.length, duration);

            return {
                responses,
                provider: this.name,
                tokensUsed,
                duration,
                questionsAnswered: responses.length,
                questionsFailed: 0,
            };

        } catch (error: any) {
            const duration = Date.now() - startTime;

            if (error.status === 429 || error.message?.includes("429")) {
                this.handleRateLimit(60);
            }

            logger.error(`[Gemini] Error:`, error.message);

            return {
                responses: [],
                provider: this.name,
                tokensUsed: 0,
                duration,
                questionsAnswered: 0,
                questionsFailed: questions.length,
            };
        }
    }

    getMaxBatchSize(): number {
        return this.maxBatchSize;
    }
}

export const geminiProvider = new GeminiProvider();
