/**
 * Product Schemas & Types
 */
import { z } from "zod";

export const createProductSchema = z.object({
    name: z.string().min(1).max(200),
    description: z.string().min(1),
    price: z.number().min(0),
    stock: z.number().min(0).optional(),
    category: z.string().optional(),
    images: z.array(z.string()).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
