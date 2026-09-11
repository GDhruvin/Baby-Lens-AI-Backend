const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notification.controller");

// POST /api/notifications/register-token
router.post("/register-token", notificationController.registerToken);

// POST /api/notifications/remove-token
router.post("/remove-token", notificationController.removeToken);

module.exports = router;
