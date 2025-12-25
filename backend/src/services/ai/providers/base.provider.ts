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
     * Parse JSON response from AI with robust repair
     */
    protected parseResponse(content: string, questions: QuestionInput[]): AIResponse[] {
        const results: AIResponse[] = [];

        try {
            // 1. Extract JSON from response (handle markdown code blocks)
            let jsonStr = content.trim();
            const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
            if (jsonMatch) {
                jsonStr = jsonMatch[1];
            }

            // 2. Initial cleanup
            jsonStr = jsonStr.trim();

            // 3. Try parsing immediately
            let parsed: any;
            try {
                parsed = JSON.parse(jsonStr);
            } catch (e) {
                // 4. Try repairing if it's truncated or slightly malformed
                logger.warn(`[${this.name}] Initial JSON parse failed, attempting repair...`);
                const repairedJson = this.repairJson(jsonStr);
                parsed = JSON.parse(repairedJson);
            }

            // 5. Build responses
            for (const q of questions) {
                const indexStr = q.index.toString();
                // Check multiple possible key formats from AI
                const key = parsed[indexStr] || parsed[q.index] || null;

                if (key) {
                    results.push({
                        index: q.index,
                        correctKey: String(key).toUpperCase().substring(0, 1), // Take only first char (A/B/C/D)
                    });
                }
            }

            // If we got NO valid mappings, treat as parse failure
            if (results.length === 0) {
                throw new Error("No valid question-to-answer mappings found in JSON");
            }

        } catch (error) {
            logger.error(`[${this.name}] Failed to parse response: ${error instanceof Error ? error.message : String(error)}`);
            // Return empty array to trigger fallback in Orchestrator
            return [];
        }

        return results;
    }

    /**
     * Simple but effective JSON repair for truncated responses
     */
    private repairJson(json: string): string {
        let repaired = json.trim();

        // If it doesn't start with {, it's likely total garbage
        if (!repaired.startsWith("{")) return "{}";

        // Count braces and quotes
        let openBraces = 0;
        let inQuotes = false;
        let escaped = false;

        for (let i = 0; i < repaired.length; i++) {
            const char = repaired[i];
            if (char === '"' && !escaped) inQuotes = !inQuotes;
            if (!inQuotes) {
                if (char === "{") openBraces++;
                if (char === "}") openBraces--;
            }
            escaped = char === "\\" && !escaped;
        }

        // 1. Close open quotes
        if (inQuotes) repaired += '"';

        // 2. Remove trailing commas if any (common in truncated objects)
        repaired = repaired.replace(/,\s*$/, "");

        // 3. Close open braces
        while (openBraces > 0) {
            repaired += "}";
            openBraces--;
        }

        return repaired;
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
