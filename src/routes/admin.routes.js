const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin.controller");
const { requireAdminAuth } = require("../middlewares/adminAuth.middleware");

// GET /admin -> Redirect to transactions dashboard (guarded)
router.get("/", requireAdminAuth, adminController.adminIndex);

// GET /admin/login -> Render login page
router.get("/login", adminController.renderLoginPage);

// POST /admin/login -> Handle credentials submission
router.post("/login", adminController.handleLogin);

// GET /admin/logout -> Clear session cookie
router.get("/logout", adminController.handleLogout);

module.exports = router;
