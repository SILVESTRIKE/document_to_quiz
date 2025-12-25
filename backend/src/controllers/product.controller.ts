/**
 * Product Controller
 * Handles HTTP request/response for product endpoints.
 */
import { Request, Response, NextFunction } from "express";
import Product from "../models/product.model";
import { NotFoundError, ForbiddenError } from "../errors";

export const productController = {
    async list(req: Request, res: Response, next: NextFunction) {
        try {
            const { page = 1, limit = 20, search, category } = req.query;
            const filter: any = { isActive: true };
            if (search) filter.$text = { $search: search as string };
            if (category) filter.category = category;

            const [total, products] = await Promise.all([
                Product.countDocuments(filter),
                Product.find(filter)
                    .sort({ createdAt: -1 })
                    .skip((+page - 1) * +limit)
                    .limit(+limit)
                    .populate("owner", "username"),
            ]);

            res.json({
                success: true,
                data: products,
                pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / +limit) },
            });
        } catch (error) {
            next(error);
        }
    },

    async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const product = await Product.findById(req.params.id).populate("owner", "username");
            if (!product) throw new NotFoundError("Product not found");
            res.json({ success: true, data: product });
        } catch (error) {
            next(error);
        }
    },

    async create(req: Request, res: Response, next: NextFunction) {
        try {
            const product = await Product.create({ ...req.body, owner: req.user!.id });
            res.status(201).json({ success: true, data: product });
        } catch (error) {
            next(error);
        }
    },

    async update(req: Request, res: Response, next: NextFunction) {
        try {
            const product = await Product.findById(req.params.id);
            if (!product) throw new NotFoundError("Product not found");
            if (product.owner.toString() !== req.user!.id && req.user!.role !== "admin") {
                throw new ForbiddenError("Not authorized to edit this product");
            }

            Object.assign(product, req.body);
            await product.save();
            res.json({ success: true, data: product });
        } catch (error) {
            next(error);
        }
    },

    async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const product = await Product.findById(req.params.id);
            if (!product) throw new NotFoundError("Product not found");
            if (product.owner.toString() !== req.user!.id && req.user!.role !== "admin") {
                throw new ForbiddenError("Not authorized to delete this product");
            }

            await product.deleteOne();
            res.json({ success: true, message: "Product deleted" });
        } catch (error) {
            next(error);
        }
    },
};
