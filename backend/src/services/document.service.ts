/**
 * Document Service
 * Handles document parsing (PDF, DOCX) and DOCX generation.
 * Implements "Sticky Section" logic for auto-detecting section headers.
 */
// Dynamic import for pdfjs-dist legacy build (ESM only in v5.x)
// Required for Node.js environments (no DOMMatrix)
let pdfjs: typeof import("pdfjs-dist");
const loadPdfjs = async () => {
    if (!pdfjs) {
        pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    }
    return pdfjs;
};
import mammoth from "mammoth";
import {
    Document,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
    Packer,
} from "docx";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { ParsedChoice, ParsedDocument, ParsedQuestion } from "../types/quiz.types";
import { AnswerSource, IQuiz } from "../models/quiz.model";
import { logger } from "../utils/logger.util";

// ==================== Types ====================

interface SmartQuestion {
    stem: string;
    choices: ParsedChoice[];
    section: string;
}

// ==================== Constants ====================

const HIGHLIGHT_COLOR = "yellow";
const CORRECT_COLOR = "00AA00"; // Green

// Regex nhận diện tiêu đề "vạn năng"
// Tìm: Chương X, Bài X, Phần X, CLO X.X, Mục X, hoặc I, II, III...
const SECTION_REGEX = /(?:Chương|Bài|Phần|Mục|CLO|Chapter|Section|Part)\s*[\d\.]+|^[IVXLCDM]{1,5}[\.\s-]/gi;

// ==================== Parser Helpers ====================

function parseQuestionBlock(block: string, section: string): SmartQuestion | null {
    // Tìm điểm bắt đầu của đáp án A.
    const choiceAIndex = block.search(/\sA\./);
    if (choiceAIndex === -1) return null;

    // 1. Lấy thân câu hỏi (Stem) và làm sạch rác
    let stem = block.substring(0, choiceAIndex)
        .replace(/\s+/g, " ")
        .trim();

    // Làm sạch Stem: Xóa các dấu hiệu nhận diện tiêu đề và số thứ tự để lưu vào DB cho đẹp
    stem = stem
        .replace(/^(?:Chương|Bài|Phần|Mục|CLO)\s*[\d\.]+/i, "")
        .replace(/^\(CLO\s*\d+\.\d+\)/i, "")
        .replace(/^Câu\s*\d+[:.]/i, "")
        .replace(/^\d+[\.\)]/i, "")
        .trim();

    // 2. Tách đáp án A, B, C, D linh hoạt
    const choicesPart = block.substring(choiceAIndex);
    const choiceRegex = /\s([A-D])\.\s+([\s\S]*?)(?=\s[A-D]\.|$)/g;
    const matches = Array.from(choicesPart.matchAll(choiceRegex));

    const choices: ParsedChoice[] = matches.map(function (m) {
        return {
            key: m[1].toUpperCase(),
            text: m[2].replace(/\s+/g, " ").trim(),
            isVisuallyMarked: false
        };
    });

    if (choices.length < 2 || !stem) return null;

    return { stem, choices, section };
}

/**
 * Parse HTML question block and detect visual marks (bold, underline, red text, highlight)
 */
function parseHtmlQuestionBlock(htmlBlock: string, section: string): SmartQuestion | null {
    // 1. Tìm vị trí đáp án A (Linh hoạt với khoảng trắng và ký tự đặc biệt)
    const choiceAIndex = htmlBlock.search(/(?:^|\s|>|&nbsp;)\s*A\.\s+/i);
    if (choiceAIndex === -1) return null;

    // 2. Tách Stem và làm sạch (remove HTML tags for clean text)
    let stem = htmlBlock.substring(0, choiceAIndex)
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    // Làm sạch Stem: xóa các dấu hiệu nhận diện tiêu đề và số thứ tự
    stem = stem
        .replace(/^(?:Chương|Bài|Phần|Mục|CLO)\s*[\d\.]+/i, "")
        .replace(/^\(CLO\s*\d+\.\d+\)/i, "")
        .replace(/^Câu\s*\d+[:.]/i, "")
        .replace(/^C\s*âu\s*\d+[:.]/i, "") // Khoảng trắng lạ
        .replace(/^\d+[\.\\)]/i, "")
        .trim();

    // 3. Tách các lựa chọn và kiểm tra "Dấu hiệu thị giác"
    const choicesPart = htmlBlock.substring(choiceAIndex);
    const choiceRegex = /(?:^|\s|>|&nbsp;)\s*([A-D])\.\s+([\s\S]*?)(?=(?:\s[A-D]\.\s+|>[A-D]\.\s+|&nbsp;[A-D]\.\s+|$))/gi;
    const matches = Array.from(choicesPart.matchAll(choiceRegex));

    const choices: ParsedChoice[] = matches.map(function (m) {
        const textWithTags = m[2];

        // TỐI ƯU: Kiểm tra class 'marked' từ styleMap hoặc các thẻ nhấn mạnh mặc định
        // Thêm kiểm tra dấu ✓ để hỗ trợ parse lại file đã giải
        const isMarked = /class="marked"|<strong>|<b>|<u>|✓/i.test(textWithTags);

        return {
            key: m[1].toUpperCase(),
            text: textWithTags.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
            isVisuallyMarked: isMarked
        };
    });

    if (choices.length < 2 || !stem) return null;
    return { stem, choices, section };
}

async function parseWithPdfjsStickySection(buffer: Buffer): Promise<SmartQuestion[]> {
    const pdfjsLib = await loadPdfjs();
    const uint8Array = new Uint8Array(buffer);
    const doc = await pdfjsLib.getDocument({ data: uint8Array }).promise;
    let fullText = "";

    // Bước 1: Trích xuất toàn bộ text
    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map(function (item: any) { return item.str; }).join(" ") + "\n";
    }

    // Bước 2: Tách văn bản thành các khối dựa trên câu hỏi
    const questionSplitRegex = /(?=\(CLO\s*\d+\.\d+\)|Câu\s*\d+[:.])|(?=\n\s*\d+[\.\)])/gi;
    const blocks = fullText.split(questionSplitRegex);

    const results: SmartQuestion[] = [];
    let currentSection = "Nội dung chung"; // Tiêu đề mặc định (Sticky)

    for (const block of blocks) {
        const cleanedBlock = block.trim();
        if (cleanedBlock.length < 10) continue;

        // KIỂM TRA XEM BLOCK NÀY CÓ CHỨA TIÊU ĐỀ MỚI KHÔNG
        // Nếu tiêu đề nằm ở ngay đầu khối văn bản, cập nhật currentSection
        const foundSection = cleanedBlock.match(new RegExp(`^${SECTION_REGEX.source}`, "i"));
        if (foundSection) {
            // Chỉ lấy phần Cha: CLO 1 thay vì CLO 1.1
            const rawSection = foundSection[0].toUpperCase();
            const majorOnly = rawSection.match(/^([A-ZÀ-Ỹ]+\s*\d+)/i);
            currentSection = majorOnly ? majorOnly[1].trim() : rawSection;
        } else {
            // Hoặc nếu tiêu đề nằm lẻ loi trong ngoặc (thường mã CLO)
            const cloInBlock = cleanedBlock.match(/\((?:CLO|Chương|Bài)\s*[\d\.]+\)/i);
            if (cloInBlock) {
                const rawClo = cloInBlock[0].replace(/[\(\)]/g, "").toUpperCase();
                const majorOnly = rawClo.match(/^([A-ZÀ-Ỹ]+\s*\d+)/i);
                currentSection = majorOnly ? majorOnly[1].trim() : rawClo;
            }
        }

        const parsed = parseQuestionBlock(cleanedBlock, currentSection);
        if (parsed) results.push(parsed);
    }

    // Log các section đã phát hiện
    const sections = Array.from(new Set(results.map(function (r) { return r.section; })));
    logger.info(`[DocumentService] PDF: Hoàn thành tách ${results.length} câu vào các mục: ${sections.join(", ")}`);

    return results;
}

function parseUniversalTextStickySection(rawText: string): SmartQuestion[] {
    // Normalize line breaks
    const normalizedText = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // Tách văn bản thành các khối dựa trên câu hỏi
    const questionSplitRegex = /(?=\(CLO\s*\d+\.\d+\)|Câu\s*\d+[:.])|(?=\n\s*\d+[\.\)])/gi;
    const blocks = normalizedText.split(questionSplitRegex);

    const results: SmartQuestion[] = [];
    let currentSection = "Nội dung chung"; // Tiêu đề mặc định (Sticky)

    for (const block of blocks) {
        const cleanedBlock = block.trim();
        if (cleanedBlock.length < 10) continue;

        // Kiểm tra tiêu đề mới
        const foundSection = cleanedBlock.match(new RegExp(`^${SECTION_REGEX.source}`, "i"));
        if (foundSection) {
            // Chỉ lấy phần Cha: CHƯƠNG 1 thay vì CHƯƠNG 1.1
            const rawSection = foundSection[0].toUpperCase();
            const majorOnly = rawSection.match(/^([A-ZÀ-Ỹ]+\s*\d+)/i);
            currentSection = majorOnly ? majorOnly[1].trim() : rawSection;
        } else {
            const cloInBlock = cleanedBlock.match(/\((?:CLO|Chương|Bài)\s*[\d\.]+\)/i);
            if (cloInBlock) {
                const rawClo = cloInBlock[0].replace(/[\(\)]/g, "").toUpperCase();
                const majorOnly = rawClo.match(/^([A-ZÀ-Ỹ]+\s*\d+)/i);
                currentSection = majorOnly ? majorOnly[1].trim() : rawClo;
            }
        }

        const parsed = parseQuestionBlock(cleanedBlock, currentSection);
        if (parsed) results.push(parsed);
    }

    const sections = Array.from(new Set(results.map(function (r) { return r.section; })));
    logger.info(`[DocumentService] DOCX: Hoàn thành tách ${results.length} câu vào các mục: ${sections.join(", ")}`);

    return results;
}

// ==================== Document Service ====================

export const documentService = {
    /**
     * Parse PDF file and extract questions with Sticky Section logic
     */
    async parsePdf(filePath: string): Promise<ParsedDocument> {
        try {
            const dataBuffer = await fs.readFile(filePath);
            const questions = await parseWithPdfjsStickySection(dataBuffer);

            return {
                title: "Tài liệu ôn thi tổng hợp",
                questions: questions.map(function (q, index) {
                    return {
                        index: index + 1,
                        stem: q.stem,
                        choices: q.choices,
                        section: q.section,
                        correctAnswerKey: "",
                        source: AnswerSource.AI_Generated,
                    } as ParsedQuestion;
                }),
            };
        } catch (error) {
            logger.error(`[DocumentService] PDF parse error:`, error);
            throw error;
        }
    },

    /**
     * Parse DOCX file and extract questions with Sticky Section logic
     * Uses HTML conversion to detect visual marks (bold, highlight, red text)
     */
    async parseDocx(filePath: string): Promise<ParsedDocument> {
        try {
            // Use convertToHtml with styleMap in options (second argument)
            const result = await mammoth.convertToHtml(
                { path: filePath },
                {
                    styleMap: [
                        "r[style='color'] => span.marked",
                        "r[style='background-color'] => span.marked",
                        "u => span.marked",
                        "strike => span.marked"
                    ]
                }
            );
            const html = result.value;

            // Tăng cường Regex tách câu:
            // 1. Sau thẻ p/div/br
            // 2. Hoặc xuất hiện cụm "Câu [số]" ở giữa dòng (có khoảng trắng phía trước)
            const questionSplitRegex = /(?=(?:<p>|<div>|<br\s*\/?>)(?:<[^>]*>)*\s*(?:\(CLO\s*\d+\.\d+\)|C\s*âu\s*\d+[:.]|\d+[\.\)]))|(?<=\s)(?=(?:C\s*âu\s*\d+[:.]|\(\s*CLO))/gi;
            const blocks = html.split(questionSplitRegex);

            let results: SmartQuestion[] = [];
            let currentSection = "Nội dung chung";

            for (const block of blocks) {
                const cleanedBlock = block.trim();
                if (cleanedBlock.length < 10) continue;

                // Update Sticky Section from HTML content (Linh hoạt hơn)
                const plainText = cleanedBlock.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
                const sectionMatch = plainText.match(SECTION_REGEX);
                if (sectionMatch) {
                    const rawSection = sectionMatch[0].toUpperCase();
                    const majorOnly = rawSection.match(/^([A-ZÀ-Ỹ]+\s*\d+)/i);
                    currentSection = majorOnly ? majorOnly[1].trim() : rawSection;
                }

                // Parse question and detect visual marks
                const parsed = parseHtmlQuestionBlock(cleanedBlock, currentSection);
                if (parsed) results.push(parsed);
            }

            // FALLBACK: If HTML parsing found 0 questions, use raw text extraction
            if (results.length === 0) {
                logger.warn(`[DocumentService] DOCX HTML extraction found 0 questions. Falling back to raw text.`);
                const { value: rawText } = await mammoth.extractRawText({ path: filePath });
                results = parseUniversalTextStickySection(rawText);
            }

            logger.info(`[DocumentService] DOCX: Extracted ${results.length} questions (HTML or Fallback)`);

            return {
                title: "Tài liệu ôn thi tổng hợp",
                questions: results.map(function (q, index) {
                    // Find visually marked choice (correct answer)
                    const markedChoice = q.choices.find(function (c) { return c.isVisuallyMarked; });

                    return {
                        index: index + 1,
                        stem: q.stem,
                        choices: q.choices,
                        section: q.section,
                        // Use marked answer if found, otherwise leave for AI
                        correctAnswerKey: markedChoice?.key || "",
                        source: markedChoice ? AnswerSource.StyleDetected : AnswerSource.AI_Generated,
                    } as ParsedQuestion;
                }),
            };
        } catch (error) {
            logger.error(`[DocumentService] DOCX parse error:`, error);
            throw error;
        }
    },

    /**
     * Parse plain text file (.txt, .rtf as text)
     */
    async parseTxt(filePath: string): Promise<ParsedDocument> {
        try {
            const rawText = await fs.readFile(filePath, "utf-8");
            const questions = parseUniversalTextStickySection(rawText);

            return {
                title: "Tài liệu ôn thi tổng hợp",
                questions: questions.map(function (q, index) {
                    return {
                        index: index + 1,
                        stem: q.stem,
                        choices: q.choices,
                        section: q.section,
                        correctAnswerKey: "",
                        source: AnswerSource.AI_Generated,
                    } as ParsedQuestion;
                }),
            };
        } catch (error) {
            logger.error(`[DocumentService] TXT parse error:`, error);
            throw error;
        }
    },

    /**
     * Parse generic document - auto-detect format
     * Supports: .pdf, .docx, .doc, .txt, .rtf, .odt
     */
    async parseGenericDocument(filePath: string): Promise<ParsedDocument> {
        const ext = path.extname(filePath).toLowerCase();

        switch (ext) {
            case ".pdf":
                return this.parsePdf(filePath);

            case ".docx":
            case ".doc":
            case ".odt":
                // mammoth can handle these formats
                return this.parseDocx(filePath);

            case ".txt":
            case ".rtf":
                // Read as plain text
                return this.parseTxt(filePath);

            default:
                throw new Error(`Unsupported document format: ${ext}`);
        }
    },

    /**
     * Generate highlighted DOCX with correct answers marked
     */
    async generateHighlightedDocx(quiz: IQuiz): Promise<Buffer> {
        const children: Paragraph[] = [];

        // Title
        children.push(
            new Paragraph({
                text: quiz.title || "Quiz Đã Giải",
                heading: HeadingLevel.HEADING_1,
                alignment: AlignmentType.CENTER,
            })
        );

        children.push(new Paragraph({ text: "" }));

        // Info text
        children.push(
            new Paragraph({
                children: [
                    new TextRun({
                        text: `Tổng số câu hỏi: ${quiz.questions.length}`,
                        italics: true,
                    }),
                ],
            })
        );

        children.push(new Paragraph({ text: "" }));

        // Group questions by section
        let currentSection = "";

        quiz.questions.forEach(function (question: any, index: number) {
            // Add section header if changed
            if (question.section && question.section !== currentSection) {
                currentSection = question.section;
                children.push(new Paragraph({ text: "" }));
                children.push(
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `📚 ${currentSection}`,
                                bold: true,
                                size: 28,
                                color: "4A5568",
                            }),
                        ],
                    })
                );
                children.push(new Paragraph({ text: "" }));
            }

            // Question stem
            children.push(
                new Paragraph({
                    children: [
                        new TextRun({
                            text: `Câu ${index + 1}: `,
                            bold: true,
                        }),
                        new TextRun({
                            text: question.stem,
                        }),
                    ],
                })
            );

            // Choices
            question.choices.forEach(function (choice: any) {
                const isCorrect = choice.key === question.correctAnswerKey;

                children.push(
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `    ${choice.key}. ${choice.text}`,
                                bold: isCorrect,
                                color: isCorrect ? CORRECT_COLOR : undefined,
                                highlight: isCorrect ? HIGHLIGHT_COLOR : undefined,
                            }),
                            isCorrect
                                ? new TextRun({
                                    text: " ✓",
                                    bold: true,
                                    color: CORRECT_COLOR,
                                })
                                : new TextRun({ text: "" }),
                        ],
                    })
                );
            });

            children.push(new Paragraph({ text: "" }));
        });

        // Footer
        children.push(
            new Paragraph({
                children: [new TextRun({ text: "---" })],
                alignment: AlignmentType.CENTER,
            })
        );
        children.push(
            new Paragraph({
                children: [
                    new TextRun({
                        text: "Tạo bởi Quiz Generator - Đáp án đã được AI xác thực",
                        italics: true,
                        size: 20,
                    }),
                ],
                alignment: AlignmentType.CENTER,
            })
        );

        const doc = new Document({
            sections: [{ children }],
        });

        const buffer = await Packer.toBuffer(doc);
        logger.info(`[DocumentService] Generated highlighted DOCX for quiz ${quiz._id}`);

        return buffer;
    },

    /**
     * Save highlighted DOCX to file and return path
     */
    async saveHighlightedDocx(quiz: IQuiz, outputDir: string): Promise<string> {
        const buffer = await this.generateHighlightedDocx(quiz);

        const fileName = `quiz_${quiz._id}_highlighted.docx`;
        const filePath = path.join(outputDir, fileName);

        if (!existsSync(outputDir)) {
            await fs.mkdir(outputDir, { recursive: true });
        }

        await fs.writeFile(filePath, buffer);
        logger.info(`[DocumentService] Saved to ${filePath}`);

        return filePath;
    },
};
