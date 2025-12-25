/**
 * Admin Routes
 */
import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { requireAdmin } from "../middlewares/role.middleware";
import { adminController } from "../controllers/admin.controller";

const router = Router();
router.use(authMiddleware);
router.use(requireAdmin);

router.get("/dashboard", adminController.getDashboard);
router.get("/users", adminController.listUsers);
router.patch("/users/:id/role", adminController.updateUserRole);
router.patch("/users/:id/status", adminController.updateUserStatus);

export default router;
