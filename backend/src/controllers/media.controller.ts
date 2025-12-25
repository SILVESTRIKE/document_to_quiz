/**
 * Media Controller
 * Handles HTTP request/response for media endpoints.
 */
import { Request, Response, NextFunction } from "express";
import { mediaService } from "../services/media.service";
import { storageService } from "../utils/storage";
import { cleanupTempFile } from "../middlewares/upload.middleware";
import { BadRequestError, NotFoundError } from "../errors";

export const mediaController = {
    async uploadSingle(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.file) throw new BadRequestError("No file provided");

            const { directoryId } = req.body;
            const folder = directoryId ? `uploads/${directoryId}` : "uploads";

            const media = await mediaService.uploadAndCreate(req.file, folder, req.user!.id, directoryId);
            res.status(201).json({
                success: true,
                data: { ...media.toObject(), url: storageService.getUrl(media.mediaPath) },
            });
        } catch (error) {
            if (req.file?.path) cleanupTempFile(req.file.path);
            next(error);
        }
    },

    async uploadMultiple(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
                throw new BadRequestError("No files provided");
            }

            const { directoryId } = req.body;
            const folder = directoryId ? `uploads/${directoryId}` : "uploads";
            const results = [];

            for (const file of req.files) {
                const media = await mediaService.uploadAndCreate(file, folder, req.user!.id, directoryId);
                results.push({ ...media.toObject(), url: storageService.getUrl(media.mediaPath) });
            }

            res.status(201).json({ success: true, data: results });
        } catch (error) {
            if (req.files && Array.isArray(req.files)) {
                req.files.forEach(function (file) {
                    cleanupTempFile(file.path);
                });
            }
            next(error);
        }
    },

    async list(req: Request, res: Response, next: NextFunction) {
        try {
            const { page, limit, search, type, directoryId } = req.query;
            const result = await mediaService.findAndPaginate({
                page: page ? +page : undefined,
                limit: limit ? +limit : undefined,
                search: search as string,
                type: type as string,
                directoryId: directoryId as string,
                uploader: req.user!.id,
            });

            const dataWithUrls = result.data.map(function (m) {
                return {
                    ...m.toObject(),
                    url: storageService.getUrl(m.mediaPath),
                };
            });

            res.json({ success: true, data: dataWithUrls, pagination: result.pagination });
        } catch (error) {
            next(error);
        }
    },

    async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const media = await mediaService.findById(req.params.id);
            if (!media) throw new NotFoundError("Media not found");
            res.json({ success: true, data: { ...media.toObject(), url: storageService.getUrl(media.mediaPath) } });
        } catch (error) {
            next(error);
        }
    },

    async update(req: Request, res: Response, next: NextFunction) {
        try {
            const { name, tags } = req.body;
            const media = await mediaService.update(req.params.id, { name, tags });
            if (!media) throw new NotFoundError("Media not found");
            res.json({ success: true, data: media });
        } catch (error) {
            next(error);
        }
    },

    async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const { force } = req.query;
            if (force === "true") {
                const deleted = await mediaService.hardDelete(req.params.id);
                if (!deleted) throw new NotFoundError("Media not found");
                res.json({ success: true, message: "Media permanently deleted" });
            } else {
                const media = await mediaService.softDelete(req.params.id);
                if (!media) throw new NotFoundError("Media not found");
                res.json({ success: true, message: "Media deleted" });
            }
        } catch (error) {
            next(error);
        }
    },
};
