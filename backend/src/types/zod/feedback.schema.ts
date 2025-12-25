/**
 * Feedback Schemas
 */
import { z } from "zod";

export const createFeedbackSchema = z.object({
    referenceId: z.string().optional(),
    referenceType: z.string().optional(),
    content: z.string().min(1).max(2000),
    rating: z.number().min(1).max(5).optional(),
});

export const updateFeedbackSchema = z.object({
    content: z.string().min(1).max(2000).optional(),
    rating: z.number().min(1).max(5).optional(),
});

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
export type UpdateFeedbackInput = z.infer<typeof updateFeedbackSchema>;
