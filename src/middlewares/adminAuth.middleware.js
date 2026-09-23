const crypto = require("crypto");

/**
 * Middleware to require and verify admin authentication
 * Supports signed HTTP-only cookies (for browser web pages)
 * and X-Admin-Key / Authorization header (for automated scripts/APIs)
 */
function requireAdminAuth(req, res, next) {
  const adminPassword = process.env.ADMIN_PASSWORD || "babylensAdmin2026!";

  // 1. Check signed cookie for web browser session
  const signedSession = req.signedCookies && req.signedCookies.admin_session;
  if (signedSession === "authenticated") {
    req.isAdmin = true;
    return next();
  }

  // 2. Check X-Admin-Key or Authorization header for API / script access
  const adminKeyHeader = req.headers["x-admin-key"];
  const authHeader = req.headers.authorization;
  if (adminKeyHeader && adminKeyHeader === adminPassword) {
    req.isAdmin = true;
    return next();
  }
  if (authHeader && authHeader === `Bearer ${adminPassword}`) {
    req.isAdmin = true;
    return next();
  }

  // 3. Unauthorized handling
  // If request is from a browser navigating to an HTML page, redirect to login
  const acceptsHtml = req.accepts("html");
  if (acceptsHtml && req.method === "GET") {
    const returnUrl = encodeURIComponent(req.originalUrl || "/admin");
    return res.redirect(`/admin/login?redirect=${returnUrl}`);
  }

  // Otherwise return JSON 401
  return res.status(401).json({
    error_code: "ADMIN_AUTH_REQUIRED",
    message: "Admin authentication required to access this resource.",
  });
}

module.exports = {
  requireAdminAuth,
};
