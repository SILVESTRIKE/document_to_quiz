/**
 * Feedback Service
 */
import mongoose, { Types } from "mongoose";
import Feedback, { IFeedback, FeedbackStatus } from "../models/feedback.model";
import { NotFoundError, BadRequestError, NotAuthorizedError } from "../errors";
import { logger } from "../utils/logger.util";

export const feedbackService = {
    async create(data: {
        userId: string;
        referenceId?: string;
        referenceType?: string;
        content: string;
        rating?: number;
    }): Promise<IFeedback> {
        return Feedback.create({
            userId: new Types.ObjectId(data.userId),
            referenceId: data.referenceId ? new Types.ObjectId(data.referenceId) : undefined,
            referenceType: data.referenceType,
            content: data.content,
            rating: data.rating,
            status: "pending_review",
        });
    },

    async findById(id: string): Promise<IFeedback | null> {
        return Feedback.findOne({ _id: id, isDeleted: false }).populate("userId", "username email");
    },

    async findByUser(userId: string, options: { page?: number; limit?: number } = {}) {
        const { page = 1, limit = 10 } = options;
        const filter = { userId: new Types.ObjectId(userId), isDeleted: false };

        const [total, data] = await Promise.all([
            Feedback.countDocuments(filter),
            Feedback.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
        ]);

        return { data, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
    },

    async findByReference(referenceId: string, referenceType: string, options: { page?: number; limit?: number; status?: FeedbackStatus } = {}) {
        const { page = 1, limit = 10, status } = options;
        const filter: any = { referenceId: new Types.ObjectId(referenceId), referenceType, isDeleted: false };
        if (status) filter.status = status;

        const [total, data] = await Promise.all([
            Feedback.countDocuments(filter),
            Feedback.find(filter).populate("userId", "username").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
        ]);

        return { data, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
    },

    async update(id: string, userId: string, data: { content?: string; rating?: number }): Promise<IFeedback | null> {
        const feedback = await Feedback.findById(id);
        if (!feedback) throw new NotFoundError("Feedback not found");
        if (feedback.userId.toString() !== userId) throw new NotAuthorizedError("Not authorized");
        if (feedback.status !== "pending_review") throw new BadRequestError("Cannot edit processed feedback");

        if (data.content) feedback.content = data.content;
        if (data.rating) feedback.rating = data.rating;
        await feedback.save();
        return feedback;
    },

    async delete(id: string, userId: string): Promise<void> {
        const feedback = await Feedback.findById(id);
        if (!feedback) throw new NotFoundError("Feedback not found");
        if (feedback.userId.toString() !== userId) throw new NotAuthorizedError("Not authorized");
        feedback.isDeleted = true;
        await feedback.save();
    },

    async approve(id: string, adminId: string, notes?: string): Promise<IFeedback> {
        const feedback = await Feedback.findById(id);
        if (!feedback) throw new NotFoundError("Feedback not found");
        if (feedback.status !== "pending_review") throw new BadRequestError("Already processed");

        feedback.status = "approved";
        feedback.adminId = new Types.ObjectId(adminId);
        if (notes) feedback.adminNotes = notes;
        await feedback.save();
        logger.info(`[Feedback] Approved: ${id}`);
        return feedback;
    },

    async reject(id: string, adminId: string, reason?: string): Promise<IFeedback> {
        const feedback = await Feedback.findById(id);
        if (!feedback) throw new NotFoundError("Feedback not found");
        if (feedback.status !== "pending_review") throw new BadRequestError("Already processed");

        feedback.status = "rejected";
        feedback.adminId = new Types.ObjectId(adminId);
        if (reason) feedback.adminNotes = reason;
        await feedback.save();
        logger.info(`[Feedback] Rejected: ${id}`);
        return feedback;
    },

    async getAverageRating(referenceId: string, referenceType: string): Promise<{ average: number; count: number }> {
        const result = await Feedback.aggregate([
            { $match: { referenceId: new Types.ObjectId(referenceId), referenceType, status: "approved", isDeleted: false, rating: { $exists: true } } },
            { $group: { _id: null, average: { $avg: "$rating" }, count: { $sum: 1 } } },
        ]);
        return result[0] || { average: 0, count: 0 };
    },
};
