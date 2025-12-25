/**
 * User Routes
 */
import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { userController } from "../controllers/user.controller";

const router = Router();
router.use(authMiddleware);

router.get("/me", userController.getMe);
router.put("/me", userController.updateMe);

export default router;
