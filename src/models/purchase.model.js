const mongoose = require("mongoose");

const purchaseSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
    },
    package_id: {
      type: String,
      required: true,
      enum: ["single_shoot", "starter_pack", "pro_pack"],
    },
    price_paid: {
      type: Number,
      required: true, // In INR (₹)
    },
    credits_added: {
      type: Number,
      required: true,
    },
    payment_status: {
      type: String,
      required: true,
      enum: ["completed", "failed", "pending"],
      default: "completed",
    },
    transaction_id: {
      type: String,
      required: true,
      unique: true,
    },
    order_id: {
      type: String,
      index: true,
      sparse: true,
    },
    purchase_token: {
      type: String,
      index: true,
    },
    purchase_state: {
      type: Number,
      default: 0, // 0 = Purchased, 1 = Canceled, 2 = Pending
    },
    consumption_state: {
      type: Number,
      default: 0, // 0 = Unconsumed, 1 = Consumed
    },
    acknowledged: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

module.exports = mongoose.model("Purchase", purchaseSchema);
