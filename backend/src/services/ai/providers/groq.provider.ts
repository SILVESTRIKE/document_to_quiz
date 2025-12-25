/**
 * Groq Cloud Provider (Layer 3)
 * Ultra-fast inference with Llama 3.1 70B.
 * Good for single questions and explanations.
 */
import { BaseProvider } from "./base.provider";
import { AIProviderName, BatchResult, QuestionInput } from "../../../types/ai.types";
import { logger } from "../../../utils/logger.util";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export class GroqProvider extends BaseProvider {
    name: AIProviderName = "Groq";
    priority = 3;

    constructor() {
        const key = process.env.GROQ_API_KEY || "";
        super(key);
    }

    async solveBatch(questions: QuestionInput[]): Promise<BatchResult> {
        const startTime = Date.now();
        const apiKey = this.getNextApiKey();

        if (!apiKey) {
            return this.emptyResult(questions.length);
        }

        try {
            const prompt = this.buildPrompt(questions);

            const response = await fetch(GROQ_API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: "llama-3.1-70b-versatile",
                    messages: [
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.1,
                    max_tokens: 2048,
                }),
            });

            if (response.status === 429) {
                this.handleRateLimit(60);
                return this.emptyResult(questions.length);
            }

            if (!response.ok) {
                throw new Error(`Groq API error: ${response.status}`);
            }

            const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { total_tokens?: number } };
            const content = data.choices?.[0]?.message?.content || "{}";
            const tokensUsed = data.usage?.total_tokens || 0;
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
            logger.error(`[Groq] Error:`, error.message);
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

export const groqProvider = new GroqProvider();
