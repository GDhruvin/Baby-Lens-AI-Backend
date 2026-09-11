const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/payment.controller");
const { requireAuth } = require("../middlewares/auth.middleware");

// GET /api/payments/transactions (Admin EJS Dashboard & JSON API)
router.get("/transactions", paymentController.renderTransactionsPage);

// POST /api/payments/verify-purchase
router.post("/verify-purchase", requireAuth, paymentController.verifyPurchase);

// POST /api/payments/mock-purchase (Legacy / Fallback testing)
router.post("/mock-purchase", requireAuth, paymentController.mockPurchase);

module.exports = router;
