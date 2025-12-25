/**
 * Media Model
 */
import mongoose, { Document, Schema } from "mongoose";

export interface IMedia extends Document {
    name: string;
    type: string;
    mediaPath: string;
    size: number;
    width?: number;
    height?: number;
    directoryId?: mongoose.Types.ObjectId;
    uploader: mongoose.Types.ObjectId;
    tags?: string[];
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const mediaSchema = new Schema<IMedia>(
    {
        name: { type: String, required: true, trim: true },
        type: { type: String, required: true },
        mediaPath: { type: String, required: true },
        size: { type: Number, required: true },
        width: Number,
        height: Number,
        directoryId: { type: Schema.Types.ObjectId, ref: "Directory", default: null },
        uploader: { type: Schema.Types.ObjectId, ref: "User", required: true },
        tags: [String],
        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true }
);

mediaSchema.index({ uploader: 1 });
mediaSchema.index({ directoryId: 1 });

export default mongoose.model<IMedia>("Media", mediaSchema);
