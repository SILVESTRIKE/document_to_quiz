/**
 * Media Schemas
 */
import { z } from "zod";

export const updateMediaSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    tags: z.array(z.string()).optional(),
});

export const createDirectorySchema = z.object({
    name: z.string().min(1).max(100),
    parentId: z.string().optional(),
});

export type UpdateMediaInput = z.infer<typeof updateMediaSchema>;
export type CreateDirectoryInput = z.infer<typeof createDirectorySchema>;
