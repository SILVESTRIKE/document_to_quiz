/**
 * Common Schemas
 */
import { z } from "zod";

export const paginationSchema = z.object({
    page: z.string().regex(/^\d+$/).transform(Number).optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).optional(),
});

export const objectIdSchema = z.object({
    id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid ID format"),
});

export const dateRangeSchema = z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
