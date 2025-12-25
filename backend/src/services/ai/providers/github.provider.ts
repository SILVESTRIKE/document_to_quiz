/**
 * GitHub Models Provider (Layer 2)
 * Uses GitHub's free AI models (gpt-4o-mini, Llama-3.1-70B).
 * Very stable, generous free limits with GitHub Token.
 */
import { BaseProvider } from "./base.provider";
import { AIProviderName, BatchResult, QuestionInput } from "../../../types/ai.types";
import { logger } from "../../../utils/logger.util";

const GITHUB_API_URL = "https://models.inference.ai.azure.com/chat/completions";

export class GitHubProvider extends BaseProvider {
    name: AIProviderName = "GitHub";
    priority = 2;

    private model: string;

    constructor() {
        const token = process.env.GITHUB_TOKEN || "";
        super(token);
        this.model = process.env.GITHUB_MODEL || "gpt-4o-mini";
    }

    async solveBatch(questions: QuestionInput[]): Promise<BatchResult> {
        const startTime = Date.now();
        const token = this.getNextApiKey();

        if (!token) {
            return this.emptyResult(questions.length);
        }

        try {
            const response = await fetch(GITHUB_API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        // Short system prompt to save input tokens (gpt-4o-mini is sensitive)
                        { role: "system", content: "You are a quiz solver. Return ONLY JSON: {\"1\":\"A\", \"2\":\"C\", ...}. No talk, no markdown." },
                        { role: "user", content: this.buildQuestionsOnlyPrompt(questions) }
                    ],
                    temperature: 0.1,
                    max_tokens: 2048,
                }),
            });

            if (response.status === 429) {
                const retryAfter = parseInt(response.headers.get("retry-after") || "60");
                this.handleRateLimit(retryAfter);
                return this.emptyResult(questions.length);
            }

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status}`);
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
            logger.error(`[GitHub] Error:`, error.message);
            return this.emptyResult(questions.length);
        }
    }

    /**
     * Build prompt with questions only (no instructions, since they're in system message)
     */
    private buildQuestionsOnlyPrompt(questions: QuestionInput[]): string {
        const lines: string[] = [];
        for (const q of questions) {
            lines.push(`[${q.index}] ${q.stem}`);
            for (const c of q.choices) {
                lines.push(`  ${c.key}. ${c.text}`);
            }
            lines.push("");
        }
        return lines.join("\n");
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

export const githubProvider = new GitHubProvider();
