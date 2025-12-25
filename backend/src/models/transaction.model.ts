/**
 * Transaction Model
 * Payment transactions with gateway integration.
 */
import mongoose, { Document, Schema, Types } from "mongoose";

export type TransactionStatus = "pending" | "completed" | "failed" | "refunded";
export type PaymentGateway = "stripe" | "paypal" | "momo" | "vnpay";

export interface ITransaction extends Document {
    _id: Types.ObjectId;
    orderId: string;
    userId: Types.ObjectId;
    planId: Types.ObjectId;
    subscriptionId?: Types.ObjectId;
    planSlug: string;
    amount: number;
    currency: string;
    billingPeriod: "monthly" | "yearly";
    status: TransactionStatus;
    paymentGateway: PaymentGateway;
    gatewayTransactionId?: string;
    gatewayResponse?: string;
    createdAt: Date;
    updatedAt: Date;
}

const transactionSchema = new Schema<ITransaction>(
    {
        orderId: { type: String, required: true, unique: true, index: true },
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        planId: { type: Schema.Types.ObjectId, ref: "Plan", required: true },
        subscriptionId: { type: Schema.Types.ObjectId, ref: "Subscription" },
        planSlug: { type: String, required: true },
        amount: { type: Number, required: true },
        currency: { type: String, default: "USD" },
        billingPeriod: { type: String, enum: ["monthly", "yearly"], required: true },
        status: {
            type: String,
            enum: ["pending", "completed", "failed", "refunded"],
            default: "pending",
        },
        paymentGateway: { type: String, enum: ["stripe", "paypal", "momo", "vnpay"], required: true },
        gatewayTransactionId: { type: String },
        gatewayResponse: { type: String },
    },
    {
        timestamps: true,
        collection: "transactions",
    }
);

export default mongoose.model<ITransaction>("Transaction", transactionSchema);
