/**
 * Admin Controller
 * Handles HTTP request/response for admin endpoints.
 */
import { Request, Response, NextFunction } from "express";
import User from "../models/user.model";
import Product from "../models/product.model";
import { NotFoundError } from "../errors";

export const adminController = {
    async getDashboard(req: Request, res: Response, next: NextFunction) {
        try {
            const [totalUsers, totalProducts] = await Promise.all([
                User.countDocuments(),
                Product.countDocuments(),
            ]);

            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);

            const newUsersThisMonth = await User.countDocuments({ createdAt: { $gte: startOfMonth } });

            res.json({
                success: true,
                data: {
                    users: { total: totalUsers, newThisMonth: newUsersThisMonth },
                    products: { total: totalProducts },
                },
            });
        } catch (error) {
            next(error);
        }
    },

    async listUsers(req: Request, res: Response, next: NextFunction) {
        try {
            const { page = 1, limit = 20, search, role } = req.query;
            const filter: any = {};
            if (search) {
                filter.$or = [
                    { username: new RegExp(search as string, "i") },
                    { email: new RegExp(search as string, "i") },
                ];
            }
            if (role) filter.role = role;

            const [total, users] = await Promise.all([
                User.countDocuments(filter),
                User.find(filter)
                    .sort({ createdAt: -1 })
                    .skip((+page - 1) * +limit)
                    .limit(+limit),
            ]);

            res.json({
                success: true,
                data: users,
                pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / +limit) },
            });
        } catch (error) {
            next(error);
        }
    },

    async updateUserRole(req: Request, res: Response, next: NextFunction) {
        try {
            const { role } = req.body;
            const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
            if (!user) throw new NotFoundError("User not found");
            res.json({ success: true, data: user });
        } catch (error) {
            next(error);
        }
    },

    async updateUserStatus(req: Request, res: Response, next: NextFunction) {
        try {
            const { isActive } = req.body;
            const user = await User.findByIdAndUpdate(req.params.id, { isActive }, { new: true });
            if (!user) throw new NotFoundError("User not found");
            res.json({ success: true, data: user });
        } catch (error) {
            next(error);
        }
    },
};
