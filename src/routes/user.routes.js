const express = require("express");
const router = express.Router();
const userController = require("../controllers/user.controller");

// Defines the POST /login endpoint (mounted at /api/auth/login)
router.post("/login", userController.login);

module.exports = router;
