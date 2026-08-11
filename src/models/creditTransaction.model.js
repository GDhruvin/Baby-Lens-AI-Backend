const mongoose = require("mongoose");

const creditTransactionSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    source: {
      type: String,
      enum: ["purchase", "usage", "admin_adjustment", "free_trial", "refund"],
      required: true,
    },
    package_id: {
      type: String,
    },
    credits: {
      type: Number,
      required: true,
    },
    order_id: {
      type: String,
      index: true,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

module.exports = mongoose.model("CreditTransaction", creditTransactionSchema);
