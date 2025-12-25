import { HfInference } from "@huggingface/inference";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GeminiAnswerResponse } from "../types/quiz.types";
import { logger } from "../utils/logger.util";
import AiTrace from "../models/aiTrace.model";
import _ from "lodash";

const hf = new HfInference(process.env.HF_ACCESS_TOKEN);
const HF_MODEL = "Qwen/Qwen2.5-72B-Instruct";
const LOCAL_MODEL = "deepseek-r1:7b";
const LOCAL_OLLAMA_URL = "http://localhost:11434/api/chat";

// Gemini Flash - Primary (single request for all questions)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const GEMINI_MODEL = "gemini-flash-latest";

// Prompt Injection Protection
const MAX_PROMPT_CHARS = 50000;
const INJECTION_PATTERNS = [
    /ignore\s+(all\s+)?(previous|above|prior)/gi,
    /forget\s+(everything|all|instructions)/gi,
    /disregard\s+(all|previous)/gi,
    /new\s+instructions?:/gi,
    /system\s*:\s*/gi,
];

function sanitizePrompt(text: string): string {
    let sanitized = text.slice(0, MAX_PROMPT_CHARS);
    for (const pattern of INJECTION_PATTERNS) {
        sanitized = sanitized.replace(pattern, "[FILTERED]");
    }
    return sanitized;
}

// Universal Prompt với Section Context
const UNIVERSAL_STRICT_PROMPT = `You are a World-Class Professor and Subject Matter Expert. 
I will provide a list of multiple-choice questions from a specialized document.

YOUR TASK:
1. Identify the subject matter from the provided questions and section context.
2. Analyze each question with high academic precision.
3. Determine the correct answer (A, B, C, or D) based on the context.
4. Return ONLY a single, compact JSON object.

JSON STRUCTURE: {"1":"A", "2":"C", ...}

STRICT RULES:
- NO markdown, NO preamble, NO explanations.
- Provide answers for ALL indices provided.
- If the document is in Vietnamese, ensure your internal reasoning accounts for Vietnamese technical terms.

QUESTIONS LIST:
`;

// Dynamic Explanation Prompt
const DYNAMIC_EXPLANATION_PROMPT = `Bạn là giảng viên chuyên ngành. 
Nhiệm vụ: Giải thích ngắn gọn (2-3 câu) tại sao đáp án đúng lại chính xác.

QUY TẮC:
- Tập trung vào kiến thức cốt lõi (Key Takeaway).
- Dùng thuật ngữ chuyên ngành phù hợp với môn học của câu hỏi.
- Ngôn ngữ: Tiếng Việt.
- Trả về: Chỉ chuỗi text giải thích, không tiêu đề.`;

export const aiService = {
    /**
     * Main entry: Gemini Flash (single request) → HF (batched) → Local Ollama
     */
    async detectAllAnswers(questions: any[]): Promise<GeminiAnswerResponse[]> {
        logger.info(`[AIService] Đang giải ${questions.length} câu hỏi...`);

        // 1. TRY GEMINI FLASH FIRST (single request for ALL questions)
        if (genAI) {
            try {
                logger.info(`[AIService] Thử Gemini Flash (1 request cho tất cả ${questions.length} câu)...`);
                const results = await this.solveWithGemini(questions);
                logger.info(`[AIService] ✓ Gemini Flash thành công!`);
                return results;
            } catch (error: any) {
                logger.warn(`[AIService] Gemini Flash lỗi: ${error.message}. Chuyển sang HF...`);
            }
        }

        // 2. FALLBACK TO HF (BATCHED)
        return this.detectWithHFBatched(questions);
    },

    /**
     * HF Batched with Local Ollama fallback per batch
     */
    async detectWithHFBatched(questions: any[]): Promise<GeminiAnswerResponse[]> {
        const BATCH_SIZE = 12;
        const chunks = _.chunk(questions, BATCH_SIZE);
        const results: GeminiAnswerResponse[] = [];

        logger.info(`[AIService] HF Batched: ${questions.length} câu (${chunks.length} lô)...`);

        for (let i = 0; i < chunks.length; i++) {
            const batch = chunks[i];
            const startIndex = i * BATCH_SIZE;

            try {
                const res = await this.solveWithHF(batch, startIndex);
                results.push(...res);
                logger.info(`[AIService] Lô ${i + 1}/${chunks.length} - HF thành công`);
            } catch (error: any) {
                if (error.message?.includes("limit") || error.status === 402 || error.status === 429) {
                    logger.warn(`[AIService] HF Hết limit! Chuyển sang Local lô ${i + 1}...`);
                    try {
                        const localRes = await this.solveWithLocalOllama(batch, startIndex);
                        results.push(...localRes);
                        logger.info(`[AIService] Lô ${i + 1}/${chunks.length} - Local thành công`);
                    } catch (localError) {
                        logger.error(`[AIService] Local cũng lỗi:`, localError);
                        batch.forEach(function () {
                            results.push({ correct_key: "A", explanation: "" });
                        });
                    }
                } else {
                    logger.error(`[AIService] Lỗi không xác định:`, error);
                    batch.forEach(function () {
                        results.push({ correct_key: "A", explanation: "" });
                    });
                }
            }
        }
        return results;
    },

    /**
     * Gemini Flash - Single request for ALL questions (primary, fastest)
     */
    async solveWithGemini(questions: any[], quizId?: string): Promise<GeminiAnswerResponse[]> {
        if (!genAI) throw new Error("GEMINI_API_KEY not configured");

        const prompt = sanitizePrompt(this.buildPromptForAll(questions));
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
        const startTime = Date.now();
        let content = "{}";
        let success = false;
        let error: string | undefined;

        try {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            content = response.text() || "{}";
            success = true;
        } catch (err: any) {
            error = err.message;
            throw err;
        } finally {
            // Log AI trace for debugging
            await AiTrace.create({
                quizId,
                aiModel: GEMINI_MODEL,
                provider: "gemini",
                inputPrompt: prompt.slice(0, 10000), // Truncate for storage
                outputRaw: content.slice(0, 10000),
                durationMs: Date.now() - startTime,
                success,
                error,
            }).catch((e) => logger.warn(`[AIService] Trace save failed: ${e.message}`));
        }

        return this.parseGeminiResponse(content, questions);
    },

    /**
     * Build prompt for ALL questions (Gemini single request)
     */
    buildPromptForAll(questions: any[]): string {
        const questionsText = questions.map(function (q, idx) {
            const choicesStr = q.choices.map(function (c: any) {
                return `${c.key}.${c.text}`;
            }).join(" | ");
            const sectionInfo = q.section ? `(${q.section}) ` : "";
            return `[${idx + 1}] ${sectionInfo}${q.stem} -> ${choicesStr}`;
        }).join("\n");

        return `${UNIVERSAL_STRICT_PROMPT}${questionsText}`;
    },

    /**
     * Parse Gemini response (all questions at once)
     */
    parseGeminiResponse(content: string, questions: any[]): GeminiAnswerResponse[] {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        let parsed: Record<string, string> = {};

        try {
            parsed = JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
        } catch (e) {
            logger.warn("[AIService] Gemini JSON parse lỗi");
        }

        return questions.map(function (q, idx) {
            const id = String(idx + 1);
            const ans = parsed[id]?.toUpperCase() || "A";
            return {
                correct_key: ans,
                explanation: ""
            };
        });
    },

    // Gọi Hugging Face (72B)
    async solveWithHF(batch: any[], startIndex: number): Promise<GeminiAnswerResponse[]> {
        const prompt = this.buildPromptWithSection(batch, startIndex);
        const response = await hf.chatCompletion({
            model: HF_MODEL,
            messages: [{ role: "user", content: prompt }],
            max_tokens: 1500,
            // @ts-ignore
            response_format: { type: "json_object" }
        });
        const content = response.choices[0]?.message?.content || "{}";
        return this.parseAIResponse(content, batch, startIndex);
    },

    // Gọi Ollama Local (DeepSeek-R1-7B) - Optimized for small model
    async solveWithLocalOllama(batch: any[], startIndex: number): Promise<GeminiAnswerResponse[]> {
        // Split into smaller chunks for 7B model (max 4 questions per call)
        const LOCAL_BATCH = 4;
        const subChunks = _.chunk(batch, LOCAL_BATCH);
        const results: GeminiAnswerResponse[] = [];

        for (let i = 0; i < subChunks.length; i++) {
            const subBatch = subChunks[i];
            const subStartIndex = startIndex + (i * LOCAL_BATCH);

            const prompt = this.buildPromptForLocal(subBatch, subStartIndex);

            try {
                const response = await fetch(LOCAL_OLLAMA_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: LOCAL_MODEL,
                        messages: [{ role: "user", content: prompt }],
                        stream: false,
                        options: {
                            temperature: 0.1, // Very low for accuracy
                            num_predict: 1000
                        }
                    })
                });
                const data = await response.json() as { message?: { content?: string } };
                const content = data.message?.content || "{}";
                const parsed = this.parseAIResponse(content, subBatch, subStartIndex);
                results.push(...parsed);
            } catch (e) {
                logger.error("[Ollama] Sub-batch error, fallback A");
                subBatch.forEach(function () {
                    results.push({ correct_key: "A", explanation: "" });
                });
            }
        }
        return results;
    },

    // Build prompt for Local 7B (allow reasoning before JSON)
    buildPromptForLocal(batch: any[], startIndex: number): string {
        const questionsText = batch.map(function (q, idx) {
            const choicesStr = q.choices.map(function (c: any) {
                return `${c.key}. ${c.text}`;
            }).join("\n");
            const sectionInfo = q.section ? `[${q.section}] ` : "";
            return `Câu ${startIndex + idx + 1}: ${sectionInfo}${q.stem}\n${choicesStr}`;
        }).join("\n\n");

        return `Bạn là chuyên gia giải đề trắc nghiệm.

Hãy phân tích kỹ từng câu hỏi bên dưới. 
Với mỗi câu, hãy suy luận ngắn gọn để loại trừ các đáp án sai, rồi xác định đáp án đúng.

${questionsText}

SAU KHI suy luận xong, trả về KẾT QUẢ dạng JSON như sau:
{"${startIndex + 1}": "A", "${startIndex + 2}": "B", ...}

Chỉ cần trả về JSON kết quả cuối cùng.`;
    },

    // Build prompt with Section Context (for batched)
    buildPromptWithSection(batch: any[], startIndex: number): string {
        const questionsText = batch.map(function (q, idx) {
            const choicesStr = q.choices.map(function (c: any) {
                return `${c.key}.${c.text}`;
            }).join(" | ");
            const sectionInfo = q.section ? `(Section: ${q.section}) ` : "";
            return `[${startIndex + idx + 1}] ${sectionInfo}${q.stem} -> ${choicesStr}`;
        }).join("\n");

        return `${UNIVERSAL_STRICT_PROMPT}${questionsText}`;
    },

    // Parse AI response (for batched)
    parseAIResponse(content: string, batch: any[], startIndex: number): GeminiAnswerResponse[] {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        let parsed: Record<string, string> = {};

        try {
            parsed = JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
        } catch (e) {
            logger.warn("[AIService] JSON parse lỗi, fallback A cho tất cả");
        }

        return batch.map(function (q, idx) {
            const id = String(startIndex + idx + 1);
            const ans = parsed[id]?.toUpperCase() || "A";
            return {
                correct_key: ans,
                explanation: ""
            };
        });
    },

    // Giải thích chi tiết khi user trả lời sai - Chỉ dùng Local Ollama
    async generateExplanation(input: any): Promise<string> {
        const correctChoice = input.choices?.find(function (c: any) {
            return c.key === input.correctAnswerKey;
        });

        const userChoice = input.choices?.find(function (c: any) {
            return c.key === input.userAnswerKey;
        });

        const prompt = `Bạn là giảng viên chuyên ngành. Học sinh vừa trả lời SAI một câu hỏi trắc nghiệm.

Câu hỏi: ${input.questionStem}

Học sinh chọn: ${input.userAnswerKey}. ${userChoice?.text || ""}
Đáp án đúng: ${input.correctAnswerKey}. ${correctChoice?.text || ""}

Hãy giải thích ngắn gọn (2-3 câu):
1. Tại sao đáp án học sinh chọn là sai
2. Tại sao đáp án đúng lại chính xác

Trả lời bằng tiếng Việt, tập trung vào kiến thức cốt lõi.`;

        try {
            const response = await fetch(LOCAL_OLLAMA_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: LOCAL_MODEL,
                    messages: [{ role: "user", content: prompt }],
                    stream: false,
                    options: {
                        temperature: 0.3,
                        num_predict: 500
                    }
                })
            });
            const data = await response.json() as { message?: { content?: string } };
            return data.message?.content?.trim() || `Đáp án đúng là ${input.correctAnswerKey}. Hãy xem lại kiến thức này.`;
        } catch (e) {
            logger.error("[Ollama] Explanation error:", e);
            return `Đáp án đúng là ${input.correctAnswerKey}. Bạn chọn ${input.userAnswerKey} là chưa chính xác. Hãy xem lại kiến thức liên quan.`;
        }
    }
};

// Export cũ để tương thích
export const geminiService = {
    detectAllAnswersSingleCall: aiService.detectAllAnswers.bind(aiService),
    generateWrongAnswerExplanation: aiService.generateExplanation.bind(aiService),
};
