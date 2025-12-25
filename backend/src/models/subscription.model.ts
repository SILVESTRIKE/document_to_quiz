/**
 * Subscription Model
 * User subscriptions with billing period and status.
 */
import mongoose, { Document, Schema, Types } from "mongoose";

export type SubscriptionStatus = "active" | "canceled" | "past_due" | "unpaid" | "trialing" | "pending_approval" | "expired";
export type BillingPeriod = "monthly" | "yearly";
export type PaymentProvider = "stripe" | "paypal" | "momo" | "vnpay";

export interface ISubscription extends Document {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    planId: Types.ObjectId;
    planSlug: string;
    provider: PaymentProvider;
    providerSubscriptionId: string;
    status: SubscriptionStatus;
    billingPeriod: BillingPeriod;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    canceledAt?: Date;
    cancelAtPeriodEnd: boolean;
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const subscriptionSchema = new Schema<ISubscription>(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        planId: { type: Schema.Types.ObjectId, ref: "Plan", required: true },
        planSlug: { type: String, required: true },
        provider: { type: String, enum: ["stripe", "paypal", "momo", "vnpay"], required: true },
        providerSubscriptionId: { type: String, required: true, unique: true },
        status: {
            type: String,
            enum: ["active", "canceled", "past_due", "unpaid", "trialing", "pending_approval", "expired"],
            required: true,
        },
        billingPeriod: { type: String, enum: ["monthly", "yearly"], required: true },
        currentPeriodStart: { type: Date, required: true },
        currentPeriodEnd: { type: Date, required: true },
        canceledAt: { type: Date },
        cancelAtPeriodEnd: { type: Boolean, default: false },
        isDeleted: { type: Boolean, default: false, select: false },
    },
    {
        timestamps: true,
        collection: "subscriptions",
    }
);

subscriptionSchema.index({ userId: 1, status: 1 });

export default mongoose.model<ISubscription>("Subscription", subscriptionSchema);
