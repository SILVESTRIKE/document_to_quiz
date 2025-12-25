/**
 * Product Model (Sample)
 */
import mongoose, { Document, Schema } from "mongoose";

export interface IProduct extends Document {
    name: string;
    description: string;
    price: number;
    stock: number;
    images: string[];
    category?: string;
    owner: mongoose.Types.ObjectId;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const productSchema = new Schema<IProduct>(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            required: true,
        },
        price: {
            type: Number,
            required: true,
            min: 0,
        },
        stock: {
            type: Number,
            default: 0,
            min: 0,
        },
        images: [String],
        category: String,
        owner: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

productSchema.index({ name: "text", description: "text" });
productSchema.index({ owner: 1 });
productSchema.index({ category: 1 });

export default mongoose.model<IProduct>("Product", productSchema);
