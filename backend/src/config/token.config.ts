/**
 * Token Configuration
 */
export const tokenConfig = {
    access: {
        secret: process.env.JWT_SECRET || "your-access-secret",
        expirationSeconds: parseInt(process.env.JWT_ACCESS_EXPIRATION || "900", 10),
    },
    refresh: {
        secret: process.env.JWT_REFRESH_SECRET || "your-refresh-secret",
        expirationSeconds: parseInt(process.env.JWT_REFRESH_EXPIRATION || "2592000", 10),
    },
};

export const refreshTokenCookieConfig = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: tokenConfig.refresh.expirationSeconds * 1000,
};
