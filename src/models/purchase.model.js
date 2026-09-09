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
      enum: ["single_shoot", "starter_pack", "pro_pack", "babylens_photoshoot_1", "babylens_photoshoot_3", "babylens_photoshoot_5"],
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
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

module.exports = mongoose.model("Purchase", purchaseSchema);
