/**
 * Media Routes
 */
import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { uploadSingle, uploadMultiple } from "../middlewares/upload.middleware";
import { mediaController } from "../controllers/media.controller";

const router = Router();
router.use(authMiddleware);

router.post("/upload", uploadSingle, mediaController.uploadSingle);
router.post("/upload-multiple", uploadMultiple, mediaController.uploadMultiple);
router.get("/", mediaController.list);
router.get("/:id", mediaController.getById);
router.put("/:id", mediaController.update);
router.delete("/:id", mediaController.delete);

export default router;
