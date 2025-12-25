/**
 * Product Schemas
 */
import { z } from "zod";

export const createProductSchema = z.object({
    name: z.string().min(1).max(200),
    description: z.string().min(1),
    price: z.number().min(0),
    stock: z.number().min(0).optional(),
    category: z.string().optional(),
    images: z.array(z.string().url()).optional(),
});

export const updateProductSchema = createProductSchema.partial();

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
