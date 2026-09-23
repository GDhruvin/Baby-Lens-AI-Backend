/**
 * Admin Authentication Controller
 */

function renderLoginPage(req, res) {
  // If already authenticated, redirect directly to dashboard
  if (req.signedCookies && req.signedCookies.admin_session === "authenticated") {
    const target = req.query.redirect || "/api/payments/transactions";
    return res.redirect(target);
  }

  const redirectTarget = req.query.redirect || "/api/payments/transactions";
  return res.render("admin-login", {
    error: null,
    message: req.query.message || null,
    redirect: redirectTarget,
  });
}

function handleLogin(req, res) {
  const { username, password, redirect } = req.body;
  const configuredUser = process.env.ADMIN_USERNAME || "admin";
  const configuredPass = process.env.ADMIN_PASSWORD || "babylensAdmin2026!";
  const targetUrl = redirect && redirect.startsWith("/") ? redirect : "/api/payments/transactions";

  if (!username || !password) {
    return res.render("admin-login", {
      error: "Username and password are required.",
      message: null,
      redirect: targetUrl,
    });
  }

  if (username.trim() !== configuredUser.trim() || password !== configuredPass) {
    return res.render("admin-login", {
      error: "Invalid admin username or password.",
      message: null,
      redirect: targetUrl,
    });
  }

  // Set secure signed session cookie (valid for 7 days)
  res.cookie("admin_session", "authenticated", {
    signed: true,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  console.log(`[AdminAuth] Admin logged in successfully: ${username}`);
  return res.redirect(targetUrl);
}

function handleLogout(req, res) {
  res.clearCookie("admin_session");
  console.log("[AdminAuth] Admin logged out");
  return res.redirect("/admin/login?message=" + encodeURIComponent("Logged out successfully"));
}

function adminIndex(req, res) {
  return res.redirect("/api/payments/transactions");
}

module.exports = {
  renderLoginPage,
  handleLogin,
  handleLogout,
  adminIndex,
};
