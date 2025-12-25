/**
 * AI Types & Interfaces
 * Type-safe definitions for the 5-layer AI fallback system.
 */

// ==================== Input Types ====================

export interface QuestionInput {
    index: number;
    stem: string;
    choices: ChoiceInput[];
    section?: string;
}

export interface ChoiceInput {
    key: string;    // A, B, C, D
    text: string;
}

// ==================== Output Types ====================

export interface AIResponse {
    index: number;
    correctKey: string;         // A, B, C, D
    explanation?: string;
    confidence?: number;        // 0-1
    tokensUsed?: number;
}

export interface BatchResult {
    responses: AIResponse[];
    provider: AIProviderName;
    tokensUsed: number;
    duration: number;           // ms
    questionsAnswered: number;
    questionsFailed: number;
}

// ==================== Provider Types ====================

export type AIProviderName =
    | "Gemini"
    | "GitHub"
    | "Groq"
    | "HuggingFace"
    | "Ollama"
    | "Cache";

export interface AIProviderConfig {
    name: AIProviderName;
    priority: number;           // Lower = higher priority
    maxBatchSize: number;
    isEnabled: boolean;
    apiKeys?: string[];         // For rotation
}

export interface AIProvider {
    name: AIProviderName;
    priority: number;

    /**
     * Check if provider is available (API key set, not rate limited)
     */
    isAvailable(): Promise<boolean>;

    /**
     * Solve a batch of questions
     */
    solveBatch(questions: QuestionInput[]): Promise<BatchResult>;

    /**
     * Get current rate limit status
     */
    getRateLimitStatus?(): { remaining: number; resetAt: Date };
}

// ==================== Cache Types ====================

export interface CacheCheckResult {
    hit: boolean;
    response?: AIResponse;
    provider?: "Cache";
}

// ==================== Error Types ====================

export interface AIError {
    provider: AIProviderName;
    code: AIErrorCode;
    message: string;
    retryAfter?: number;        // seconds
}

export type AIErrorCode =
    | "RATE_LIMITED"            // 429
    | "QUOTA_EXCEEDED"          // API quota exhausted
    | "NETWORK_ERROR"           // Connection issues
    | "INVALID_RESPONSE"        // Unparseable AI response
    | "PROVIDER_UNAVAILABLE"    // API key missing or invalid
    | "UNKNOWN";

// ==================== Orchestrator Types ====================

export interface OrchestratorResult {
    responses: AIResponse[];
    providersUsed: AIProviderName[];
    totalTokens: number;
    cacheHits: number;
    cacheMisses: number;
    failedQuestions: number;
    duration: number;
}

export interface OrchestratorOptions {
    maxRetries?: number;
    retryDelayMs?: number;
    enableCache?: boolean;
    preferredProvider?: AIProviderName;
}

// ==================== Token Optimization ====================

export interface TokenStats {
    inputTokens: number;
    outputTokens: number;
    savedByCache: number;
    savedByPruning: number;
}

/**
 * Prune text to reduce token consumption
 * - Remove extra whitespace
 * - Truncate long texts
 * - Remove filler words
 */
export function pruneText(text: string, maxLength: number = 500): string {
    return text
        .replace(/\s+/g, " ")           // Collapse whitespace
        .replace(/\.\.\./g, "…")        // Unicode ellipsis
        .trim()
        .substring(0, maxLength);
}

/**
 * Estimate token count (rough approximation)
 * Vietnamese ~1.5 tokens per word, English ~1.3
 */
export function estimateTokens(text: string): number {
    const words = text.split(/\s+/).length;
    return Math.ceil(words * 1.5);
}
