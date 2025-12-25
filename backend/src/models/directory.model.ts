/**
 * Directory Model
 * Hierarchical folder structure for organizing files.
 */
import mongoose, { Document, Schema, Types } from "mongoose";

export interface IDirectory extends Document {
    _id: Types.ObjectId;
    name: string;
    parentId: Types.ObjectId | null;
    creatorId: Types.ObjectId;
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const directorySchema = new Schema<IDirectory>(
    {
        name: { type: String, required: true, trim: true },
        parentId: {
            type: Schema.Types.ObjectId,
            ref: "Directory",
            default: null,
            index: true,
        },
        creatorId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        isDeleted: { type: Boolean, default: false, select: false },
    },
    {
        timestamps: true,
        collection: "directories",
        toJSON: {
            virtuals: true,
            transform: (doc, ret: any) => {
                ret.id = ret._id.toString();
                delete ret._id;
                delete ret.__v;
            },
        },
        toObject: {
            virtuals: true,
            transform: (doc, ret: any) => {
                ret.id = ret._id.toString();
                delete ret._id;
                delete ret.__v;
                delete ret.isDeleted;
            },
        },
    }
);

export default mongoose.model<IDirectory>("Directory", directorySchema);
