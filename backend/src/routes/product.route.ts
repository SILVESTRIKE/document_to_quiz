/**
 * Product Routes
 */
import { Router } from "express";
import { authMiddleware, optionalAuthMiddleware } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validation.middleware";
import { productController } from "../controllers/product.controller";
import { createProductSchema } from "../types/product.types";

const router = Router();

// Public routes
router.get("/", optionalAuthMiddleware, productController.list);
router.get("/:id", productController.getById);

// Protected routes
router.post("/", authMiddleware, validate(createProductSchema, "body"), productController.create);
router.put("/:id", authMiddleware, productController.update);
router.delete("/:id", authMiddleware, productController.delete);

export default router;
