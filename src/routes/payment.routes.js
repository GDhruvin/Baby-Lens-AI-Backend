const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/payment.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireAdminAuth } = require("../middlewares/adminAuth.middleware");

// GET /api/payments/transactions (Admin EJS Dashboard & JSON API) [ADMIN]
router.get("/transactions", requireAdminAuth, paymentController.renderTransactionsPage);

// POST /api/payments/verify-purchase (Mobile App In-App Purchase Verification)
router.post("/verify-purchase", requireAuth, paymentController.verifyPurchase);

// POST /api/payments/mock-purchase (Mobile App Fallback / Mock In-App Purchase)
router.post("/mock-purchase", requireAuth, paymentController.mockPurchase);

module.exports = router;

