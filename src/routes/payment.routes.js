const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/payment.controller");
const { requireAuth } = require("../middlewares/auth.middleware");

// POST /api/payments/mock-purchase
router.post("/mock-purchase", requireAuth, paymentController.mockPurchase);

module.exports = router;
