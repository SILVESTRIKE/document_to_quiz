/**
 * User Model
 */
import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
    username: string;
    email: string;
    password: string;
    fullName?: string;
    avatarUrl?: string;
    role: "user" | "admin" | "moderator";
    isVerified: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const userSchema = new Schema<IUser>(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        password: {
            type: String,
            required: true,
            select: false,
        },
        fullName: String,
        avatarUrl: String,
        role: {
            type: String,
            enum: ["user", "admin", "moderator"],
            default: "user",
        },
        isVerified: {
            type: Boolean,
            default: false,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

// Note: email and username already have indexes from unique: true

export default mongoose.model<IUser>("User", userSchema);
