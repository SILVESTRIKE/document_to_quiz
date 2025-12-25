/**
 * Media Service
 */
import mongoose, { Types } from "mongoose";
import Media, { IMedia } from "../models/media.model";
import { storageService } from "../utils/storage";
import { NotFoundError } from "../errors";
import { logger } from "../utils/logger.util";
import { v4 as uuidv4 } from "uuid";

export interface FindMediasOptions {
    page?: number;
    limit?: number;
    search?: string;
    type?: string;
    directoryId?: string | null;
    uploader?: string;
}

export const mediaService = {
    async create(data: {
        name: string;
        type: string;
        mediaPath: string;
        size: number;
        width?: number;
        height?: number;
        directoryId?: string | null;
        uploader: string;
        tags?: string[];
    }): Promise<IMedia> {
        return Media.create({
            ...data,
            uploader: new Types.ObjectId(data.uploader),
            directoryId: data.directoryId ? new Types.ObjectId(data.directoryId) : null,
        });
    },

    async findById(id: string): Promise<IMedia | null> {
        return Media.findOne({ _id: id, isDeleted: false });
    },

    async findAndPaginate(options: FindMediasOptions) {
        const { page = 1, limit = 50, search, type, directoryId, uploader } = options;
        const filter: any = { isDeleted: false };

        if (directoryId !== undefined) filter.directoryId = directoryId;
        if (uploader) filter.uploader = new Types.ObjectId(uploader);
        if (search) filter.name = new RegExp(search, "i");
        if (type) filter.type = new RegExp(`^${type}/`, "i");

        const [totalItems, data] = await Promise.all([
            Media.countDocuments(filter),
            Media.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit),
        ]);

        return {
            data,
            pagination: { totalItems, totalPages: Math.ceil(totalItems / limit), currentPage: page, limit },
        };
    },

    async update(id: string, data: Partial<IMedia>): Promise<IMedia | null> {
        return Media.findOneAndUpdate({ _id: id, isDeleted: false }, { $set: data }, { new: true });
    },

    async softDelete(id: string): Promise<IMedia | null> {
        return Media.findOneAndUpdate({ _id: id, isDeleted: false }, { isDeleted: true }, { new: true });
    },

    async hardDelete(id: string): Promise<boolean> {
        const media = await Media.findById(id);
        if (!media) return false;
        await storageService.delete(media.mediaPath);
        await Media.deleteOne({ _id: id });
        logger.info(`[MediaService] Hard deleted: ${id}`);
        return true;
    },

    async uploadAndCreate(
        file: Express.Multer.File,
        folder: string,
        uploaderId: string,
        directoryId?: string
    ): Promise<IMedia> {
        const filename = `${Date.now()}-${uuidv4()}-${file.originalname}`;
        const resourceType = file.mimetype.startsWith("video/") ? "video" : "image";

        const result = await storageService.uploadFile(file.path, folder, filename);
        if (!result) throw new Error("Upload failed");

        return this.create({
            name: file.originalname,
            type: file.mimetype,
            mediaPath: result.path,
            size: file.size,
            directoryId,
            uploader: uploaderId,
        });
    },
};
