/**
 * Feedback Controller
 * Handles HTTP request/response for feedback endpoints.
 */
import { Request, Response, NextFunction } from "express";
import { feedbackService } from "../services/feedback.service";

export const feedbackController = {
    async getByReference(req: Request, res: Response, next: NextFunction) {
        try {
            const { page, limit, status } = req.query;
            const result = await feedbackService.findByReference(req.params.id, req.params.type, {
                page: page ? +page : undefined,
                limit: limit ? +limit : undefined,
                status: status as any,
            });
            res.json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    },

    async getAverageRating(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await feedbackService.getAverageRating(req.params.id, req.params.type);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    },

    async create(req: Request, res: Response, next: NextFunction) {
        try {
            const feedback = await feedbackService.create({ userId: req.user!.id, ...req.body });
            res.status(201).json({ success: true, data: feedback });
        } catch (error) {
            next(error);
        }
    },

    async getMyFeedbacks(req: Request, res: Response, next: NextFunction) {
        try {
            const { page, limit } = req.query;
            const result = await feedbackService.findByUser(req.user!.id, {
                page: page ? +page : undefined,
                limit: limit ? +limit : undefined,
            });
            res.json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    },

    async update(req: Request, res: Response, next: NextFunction) {
        try {
            const feedback = await feedbackService.update(req.params.id, req.user!.id, req.body);
            res.json({ success: true, data: feedback });
        } catch (error) {
            next(error);
        }
    },

    async delete(req: Request, res: Response, next: NextFunction) {
        try {
            await feedbackService.delete(req.params.id, req.user!.id);
            res.json({ success: true, message: "Feedback deleted" });
        } catch (error) {
            next(error);
        }
    },

    async approve(req: Request, res: Response, next: NextFunction) {
        try {
            const feedback = await feedbackService.approve(req.params.id, req.user!.id, req.body.notes);
            res.json({ success: true, data: feedback });
        } catch (error) {
            next(error);
        }
    },

    async reject(req: Request, res: Response, next: NextFunction) {
        try {
            const feedback = await feedbackService.reject(req.params.id, req.user!.id, req.body.reason);
            res.json({ success: true, data: feedback });
        } catch (error) {
            next(error);
        }
    },
};
