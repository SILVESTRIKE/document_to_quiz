/**
 * Base AI Provider
 * Abstract class for all AI providers with common functionality.
 */
import { AIProvider, AIProviderName, BatchResult, QuestionInput, AIResponse } from "../../../types/ai.types";
import { logger } from "../../../utils/logger.util";

export abstract class BaseProvider implements AIProvider {
    abstract name: AIProviderName;
    abstract priority: number;

    protected apiKeys: string[] = [];
    protected currentKeyIndex: number = 0;
    protected lastRateLimitReset?: Date;
    protected rateLimitRemaining: number = Infinity;

    constructor(apiKeys: string | string[] = []) {
        this.apiKeys = Array.isArray(apiKeys) ? apiKeys : apiKeys.split(",").filter(k => k.trim());
    }

    /**
     * Get next API key (round-robin rotation)
     */
    protected getNextApiKey(): string | null {
        if (this.apiKeys.length === 0) return null;

        const key = this.apiKeys[this.currentKeyIndex];
        this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
        return key;
    }

    /**
     * Check if provider has valid API keys
     */
    async isAvailable(): Promise<boolean> {
        return this.apiKeys.length > 0;
    }

    /**
     * Build prompt from questions
     */
    protected buildPrompt(questions: QuestionInput[]): string {
        const lines: string[] = [
            "You are a World-Class Professor. Analyze these multiple-choice questions and provide the correct answer.",
            "",
            "STRICT RULES:",
            "- Return ONLY a JSON object: {\"1\":\"A\", \"2\":\"C\", ...}",
            "- Use the question index as key",
            "- NO markdown, NO explanation, ONLY JSON",
            "",
            "QUESTIONS:"
        ];

        for (const q of questions) {
            lines.push(`\n[${q.index}] ${q.stem}`);
            for (const c of q.choices) {
                lines.push(`  ${c.key}. ${c.text}`);
            }
        }

        return lines.join("\n");
    }

    /**
     * Parse JSON response from AI
     */
    protected parseResponse(content: string, questions: QuestionInput[]): AIResponse[] {
        const results: AIResponse[] = [];

        try {
            // Extract JSON from response (handle markdown code blocks)
            let jsonStr = content;
            const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1];
            }

            // Clean and parse
            jsonStr = jsonStr.replace(/[\r\n]/g, "").trim();
            const parsed = JSON.parse(jsonStr);

            for (const q of questions) {
                const key = parsed[q.index.toString()] || parsed[q.index] || "A";
                results.push({
                    index: q.index,
                    correctKey: key.toUpperCase(),
                });
            }
        } catch (error) {
            logger.error(`[${this.name}] Failed to parse response:`, error);
            // Return fallback for all questions
            for (const q of questions) {
                results.push({
                    index: q.index,
                    correctKey: "A", // Fallback
                });
            }
        }

        return results;
    }

    /**
     * Handle rate limit response
     */
    protected handleRateLimit(retryAfterSeconds?: number): void {
        this.rateLimitRemaining = 0;
        this.lastRateLimitReset = new Date(Date.now() + (retryAfterSeconds || 60) * 1000);
        logger.warn(`[${this.name}] Rate limited. Reset at: ${this.lastRateLimitReset.toISOString()}`);
    }

    /**
     * Get rate limit status
     */
    getRateLimitStatus(): { remaining: number; resetAt: Date } {
        return {
            remaining: this.rateLimitRemaining,
            resetAt: this.lastRateLimitReset || new Date(),
        };
    }

    /**
     * Log token usage
     */
    protected logTokenUsage(tokensUsed: number, questionsCount: number, duration: number): void {
        logger.info(`[AI] Provider: ${this.name} | Questions: ${questionsCount} | Tokens: ${tokensUsed} | Time: ${duration}ms`);
    }

    /**
     * Abstract method - implement in each provider
     */
    abstract solveBatch(questions: QuestionInput[]): Promise<BatchResult>;
}
