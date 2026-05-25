const mongoose = require("mongoose");

const generationSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    baby_profile_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BabyProfile",
      required: true,
    },
    theme_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Theme",
    },
    theme_selected: { type: String, required: true },

    // The final 3 AI generated image URLs
    output_image_urls: [{ type: String }],

    // Did they pay or use a free credit?
    payment_type: { type: String, enum: ["free", "paid"], required: true },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  },
);

module.exports = mongoose.model("Generation", generationSchema);
