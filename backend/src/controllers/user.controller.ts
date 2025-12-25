/**
 * User Controller
 * Handles HTTP request/response for user endpoints.
 */
import { Request, Response, NextFunction } from "express";
import User from "../models/user.model";
import { NotFoundError } from "../errors";

export const userController = {
    async getMe(req: Request, res: Response, next: NextFunction) {
        try {
            const user = await User.findById(req.user!.id);
            if (!user) throw new NotFoundError("User not found");
            res.json({ success: true, data: user });
        } catch (error) {
            next(error);
        }
    },

    async updateMe(req: Request, res: Response, next: NextFunction) {
        try {
            const { fullName, avatarUrl } = req.body;
            const user = await User.findByIdAndUpdate(
                req.user!.id,
                { fullName, avatarUrl },
                { new: true }
            );
            if (!user) throw new NotFoundError("User not found");
            res.json({ success: true, data: user });
        } catch (error) {
            next(error);
        }
    },
};
