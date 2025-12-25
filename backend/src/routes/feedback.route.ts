/**
 * Feedback Routes
 */
import { Router } from "express";
import { authMiddleware, optionalAuthMiddleware } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validation.middleware";
import { requireAdmin } from "../middlewares/role.middleware";
import { feedbackController } from "../controllers/feedback.controller";
import { createFeedbackSchema } from "../types/feedback.types";

const router = Router();

// Public routes
router.get("/reference/:type/:id", optionalAuthMiddleware, feedbackController.getByReference);
router.get("/reference/:type/:id/rating", feedbackController.getAverageRating);

// Protected routes
router.use(authMiddleware);

router.post("/", validate(createFeedbackSchema, "body"), feedbackController.create);
router.get("/my", feedbackController.getMyFeedbacks);
router.put("/:id", feedbackController.update);
router.delete("/:id", feedbackController.delete);

// Admin routes
router.patch("/:id/approve", requireAdmin, feedbackController.approve);
router.patch("/:id/reject", requireAdmin, feedbackController.reject);

export default router;
