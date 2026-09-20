const express = require("express");
const router = express.Router();
const userController = require("../controllers/user.controller");
const { requireAuth } = require("../middlewares/auth.middleware");

// POST /api/auth/login
router.post("/login", userController.login);

// GET /api/auth/me
router.get("/me", requireAuth, userController.getProfile);

// DELETE /api/auth/account (and alias /api/auth/me)
router.delete("/account", requireAuth, userController.deleteAccount);
router.delete("/me", requireAuth, userController.deleteAccount);

module.exports = router;
