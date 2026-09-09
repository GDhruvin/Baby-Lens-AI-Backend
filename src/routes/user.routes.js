const express = require("express");
const router = express.Router();
const userController = require("../controllers/user.controller");
const { requireAuth } = require("../middlewares/auth.middleware");

// POST /api/auth/login
router.post("/login", userController.login);

// GET /api/users/me
router.get("/me", requireAuth, userController.getProfile);

module.exports = router;
