/**
 * Plan Model
 * Subscription plans with pricing and feature limits.
 */
import mongoose, { Document, Schema, Types } from "mongoose";

export interface IPlan extends Document {
    _id: Types.ObjectId;
    name: string;
    slug: string;
    priceMonthly: number;
    priceYearly: number;
    tokenAllotment: number;
    featureLimit: number;
    storageLimit: number; // in MB
    apiAccess: boolean;
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const planSchema = new Schema<IPlan>(
    {
        name: { type: String, required: true },
        slug: { type: String, required: true, unique: true },
        priceMonthly: { type: Number, required: true, min: 0 },
        priceYearly: { type: Number, required: true, min: 0 },
        tokenAllotment: { type: Number, required: true, min: 0 },
        featureLimit: { type: Number, required: true, default: 10 },
        storageLimit: { type: Number, required: true, default: 100 }, // MB
        apiAccess: { type: Boolean, default: false },
        isDeleted: { type: Boolean, default: false, select: false },
    },
    {
        timestamps: true,
        collection: "plans",
        toJSON: {
            virtuals: true,
            transform: (doc, ret: any) => {
                ret.id = ret._id;
                delete ret._id;
                delete ret.__v;
                delete ret.isDeleted;
            },
        },
    }
);

export default mongoose.model<IPlan>("Plan", planSchema);
