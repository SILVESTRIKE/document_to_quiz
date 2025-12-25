/**
 * Auth Routes
 */
import { Router } from "express";
import { validate } from "../middlewares/validation.middleware";
import { authLimiter } from "../middlewares/rateLimiter.middleware";
import { authController } from "../controllers/auth.controller";
import { registerSchema, loginSchema } from "../types/auth.types";

const router = Router();

router.post("/register", authLimiter, validate(registerSchema, "body"), authController.register);
router.post("/login", authLimiter, validate(loginSchema, "body"), authController.login);
router.post("/logout", authController.logout);
router.post("/refresh-token", authController.refreshToken);

export default router;
