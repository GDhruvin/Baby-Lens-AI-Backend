const mongoose = require("mongoose");

const deviceTokenSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },
    device_id: {
      type: String,
      required: true,
      index: true,
    },
    fcm_token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    platform: {
      type: String,
      enum: ["android", "ios"],
      default: "android",
    },
    is_active: {
      type: Boolean,
      default: true,
      index: true,
    },
    last_seen_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

// Compound index to quickly fetch active tokens for a specific user
deviceTokenSchema.index({ user_id: 1, is_active: 1 });

module.exports = mongoose.model("DeviceToken", deviceTokenSchema);
