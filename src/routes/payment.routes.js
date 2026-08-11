const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/payment.controller");
const { requireAuth } = require("../middlewares/auth.middleware");

// POST /api/payments/verify-purchase (Production Google Play Receipt Verification)
router.post("/verify-purchase", requireAuth, paymentController.verifyPurchase);

// POST /api/payments/mock-purchase (Legacy/Testing)
router.post("/mock-purchase", requireAuth, paymentController.mockPurchase);

module.exports = router;
