import { Router } from "express";
import { authMiddleware, optionalAuthMiddleware } from "../middlewares/auth.middleware";
import { uploadQuizDocument } from "../middlewares/quizUpload.middleware";
import { quizController } from "../controllers/quiz.controller";

const router = Router();

/**
 * @swagger
 * /api/v1/quizzes/upload:
 *   post:
 *     summary: Upload a document to create a quiz
 *     tags: [Quizzes]
 *     security:
 *       - bearerAuth: []
 */
router.post("/upload", authMiddleware, uploadQuizDocument, quizController.uploadQuiz);

/**
 * @swagger
 * /api/v1/quizzes/debug/parse:
 *   post:
 *     summary: Debug endpoint - Parse file and return raw JSON (no database save)
 *     tags: [Quizzes]
 *     security:
 *       - bearerAuth: []
 */
router.post("/debug/parse", authMiddleware, uploadQuizDocument, quizController.debugParse);

/**
 * @swagger
 * /api/v1/quizzes/{id}/status:
 *   get:
 *     summary: Get quiz processing status
 *     tags: [Quizzes]
 */
router.get("/:id/status", optionalAuthMiddleware, quizController.getQuizStatus);

/**
 * @swagger
 * /api/v1/quizzes/{id}:
 *   get:
 *     summary: Get full quiz with questions
 *     tags: [Quizzes]
 */
router.get("/:id", optionalAuthMiddleware, quizController.getQuiz);

/**
 * @swagger
 * /api/v1/quizzes:
 *   get:
 *     summary: Get list of quizzes (public or user-specific if logged in)
 *     tags: [Quizzes]
 */
router.get("/", optionalAuthMiddleware, quizController.listQuizzes);

/**
 * @swagger
 * /api/v1/quizzes/{id}/questions/{qid}:
 *   put:
 *     summary: Update a specific question (manual correction)
 *     tags: [Quizzes]
 *     security:
 *       - bearerAuth: []
 */
router.put("/:id/questions/:qid", authMiddleware, quizController.updateQuestion);

/**
 * @swagger
 * /api/v1/quizzes/{id}:
 *   delete:
 *     summary: Delete a quiz
 *     tags: [Quizzes]
 *     security:
 *       - bearerAuth: []
 */
router.delete("/:id", authMiddleware, quizController.deleteQuiz);

/**
 * @swagger
 * /api/v1/quizzes/{id}/questions/{qid}/explain:
 *   post:
 *     summary: Get AI explanation when user answers incorrectly
 *     tags: [Quizzes]
 *     security:
 *       - bearerAuth: []
 */
router.post("/:id/questions/:qid/explain", optionalAuthMiddleware, quizController.explainWrongAnswer);

/**
 * @swagger
 * /api/v1/quizzes/{id}/download:
 *   get:
 *     summary: Download quiz as DOCX with highlighted correct answers
 *     tags: [Quizzes]
 */
router.get("/:id/download", optionalAuthMiddleware, quizController.downloadHighlightedDoc);

export default router;
