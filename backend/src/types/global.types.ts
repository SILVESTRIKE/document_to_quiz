/**
 * Global Type Definitions
 */

// Pagination
export interface PaginationMeta {
    total: number;
    page: number;
    limit: number;
    pages: number;
}

export interface PaginatedResponse<T> {
    data: T[];
    pagination: PaginationMeta;
}

// API Response
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    message?: string;
    errors?: { message: string; field?: string }[];
}

// User roles
export type UserRole = "user" | "admin" | "moderator";

// Subscription types
export type SubscriptionStatus = "active" | "canceled" | "past_due" | "unpaid" | "trialing" | "pending_approval" | "expired";
export type BillingPeriod = "monthly" | "yearly";
export type PaymentProvider = "stripe" | "paypal" | "momo" | "vnpay";
export type TransactionStatus = "pending" | "completed" | "failed" | "refunded";

// Feedback
export type FeedbackStatus = "pending_review" | "approved" | "rejected";

// Media
export type MediaType = "image" | "video" | "document";
export type StorageMode = "local" | "cloud";

export interface UploadedFile {
    url: string;
    path: string;
    filename?: string;
    publicId?: string;
    size?: number;
    mimetype?: string;
}

// Common
export type ObjectId = string;

export interface Timestamps {
    createdAt: Date;
    updatedAt: Date;
}

export interface SoftDeletable {
    isDeleted: boolean;
}
