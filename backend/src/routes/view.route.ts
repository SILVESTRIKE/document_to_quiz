/**
 * View Routes
 * Routes for rendering EJS views
 */
import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const router = Router();

// Helper to check if user might be logged in (has refresh token)
// Note: Access token is now stored in memory on frontend, not in cookies
// So we check refreshToken to determine auth state for SSR pages
function getUserFromToken(req: Request): any {
    try {
        // Check if refresh token exists - indicates user is logged in
        const refreshToken = req.cookies?.refreshToken;
        if (!refreshToken) {
            // No refresh token = definitely not logged in
            return null;
        }

        // Try to decode refresh token to get user id (for display purposes)
        // Don't verify signature here - just extract payload
        const decoded = jwt.decode(refreshToken) as { id: string } | null;
        if (decoded?.id) {
            // Return minimal user info - frontend will fetch full data via API
            return { id: decoded.id, _fromRefreshToken: true };
        }

        return null;
    } catch (error: any) {
        console.log('[ViewRoute] Token decode failed:', error.message);
        return null;
    }
}

// ===== Public Pages =====

// Home page
router.get("/", function homePage(req: Request, res: Response) {
    const user = getUserFromToken(req);
    res.render("pages/home", {
        title: "Trang chủ",
        user,
        flash: req.query.flash ? { [req.query.type as string]: req.query.flash } : null
    });
});

// Login page
router.get("/login", function loginPage(req: Request, res: Response) {
    const user = getUserFromToken(req);
    if (user) {
        res.redirect("/dashboard");
        return;
    }
    res.render("auth/login", {
        title: "Đăng nhập",
        user: null,
        error: req.query.error || null,
        flash: null
    });
});

// Register page
router.get("/register", function registerPage(req: Request, res: Response) {
    const user = getUserFromToken(req);
    if (user) {
        res.redirect("/dashboard");
        return;
    }
    res.render("auth/register", {
        title: "Đăng ký",
        user: null,
        error: req.query.error || null,
        flash: null
    });
});

// Logout
router.get("/logout", function logoutPage(req: Request, res: Response) {
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");
    res.redirect("/?type=success&flash=Đã đăng xuất thành công");
});

// ===== Protected Pages =====

// Dashboard - Public page (quizzes filtered by user if logged in)
router.get("/dashboard", function dashboardPage(req: Request, res: Response) {
    const user = getUserFromToken(req);
    res.render("pages/dashboard", {
        title: "Dashboard",
        user,
        flash: null
    });
});

// Upload page
router.get("/upload", function uploadPage(req: Request, res: Response) {
    const user = getUserFromToken(req);
    if (!user) {
        res.redirect("/login?error=Vui lòng đăng nhập");
        return;
    }
    res.render("quiz/upload", {
        title: "Upload tài liệu",
        user,
        flash: null
    });
});

// Quiz detail page (public - auth handled by frontend)
router.get("/quiz/:id", function quizDetailPage(req: Request, res: Response) {
    const user = getUserFromToken(req);
    res.render("quiz/detail", {
        title: "Chi tiết Quiz",
        user,
        quizId: req.params.id,
        flash: null
    });
});

// Quiz processing status page
router.get("/quiz/:id/status", function quizStatusPage(req: Request, res: Response) {
    const user = getUserFromToken(req);
    if (!user) {
        res.redirect("/login?error=Vui lòng đăng nhập");
        return;
    }
    res.render("quiz/processing", {
        title: "Trạng thái xử lý",
        user,
        quizId: req.params.id,
        flash: null
    });
});

// Quiz practice page
router.get("/quiz/:id/practice", function quizPracticePage(req: Request, res: Response) {
    const user = getUserFromToken(req);
    if (!user) {
        res.redirect("/login?error=Vui lòng đăng nhập");
        return;
    }
    res.render("quiz/practice", {
        title: "Làm bài Quiz",
        user,
        quizId: req.params.id,
        flash: null
    });
});

// ===== Error Pages =====

// 404 handler (will be added after all routes)
router.get("/404", function notFoundPage(req: Request, res: Response) {
    res.status(404).render("errors/404", {
        title: "Không tìm thấy",
        user: getUserFromToken(req),
        flash: null
    });
});

// 500 handler
router.get("/500", function serverErrorPage(req: Request, res: Response) {
    res.status(500).render("errors/500", {
        title: "Lỗi máy chủ",
        user: getUserFromToken(req),
        flash: null
    });
});

export default router;
