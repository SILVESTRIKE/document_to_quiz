/**
 * Hugging Face Provider (Layer 4)
 * Serverless inference with Qwen/Mistral models.
 * Last resort before graceful postponement.
 */
import { HfInference } from "@huggingface/inference";
import { BaseProvider } from "./base.provider";
import { AIProviderName, BatchResult, QuestionInput } from "../../../types/ai.types";
import { logger } from "../../../utils/logger.util";

const HF_MODEL = "Qwen/Qwen2.5-72B-Instruct";

export class HuggingFaceProvider extends BaseProvider {
    name: AIProviderName = "HuggingFace";
    priority = 4;

    private hf: HfInference | null = null;

    constructor() {
        const token = process.env.HF_ACCESS_TOKEN || "";
        super(token);

        if (token) {
            this.hf = new HfInference(token);
        }
    }

    async isAvailable(): Promise<boolean> {
        return this.hf !== null;
    }

    async solveBatch(questions: QuestionInput[]): Promise<BatchResult> {
        const startTime = Date.now();

        if (!this.hf) {
            return this.emptyResult(questions.length);
        }

        try {
            const prompt = this.buildPrompt(questions);

            const response = await this.hf.chatCompletion({
                model: HF_MODEL,
                messages: [
                    { role: "user", content: prompt }
                ],
                max_tokens: 2048,
            });

            const content = response.choices?.[0]?.message?.content || "{}";
            const duration = Date.now() - startTime;

            // HF doesn't always provide token count
            const tokensUsed = 0;

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
            logger.error(`[HuggingFace] Error:`, error.message);

            if (error.message?.includes("429") || error.message?.includes("rate")) {
                this.handleRateLimit(120);
            }

            return this.emptyResult(questions.length);
        }
    }

    private emptyResult(failedCount: number): BatchResult {
        return {
            responses: [],
            provider: this.name,
            tokensUsed: 0,
            duration: 0,
            questionsAnswered: 0,
            questionsFailed: failedCount,
        };
    }
}

export const huggingFaceProvider = new HuggingFaceProvider();
