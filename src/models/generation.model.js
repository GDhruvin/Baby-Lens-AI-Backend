const mongoose = require("mongoose");

const generationSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    baby_profile_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BabyProfile",
      required: true,
      index: true,
    },
    theme_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Theme",
      index: true,
    },
    theme_selected: { type: String, required: true },

    // The final AI generated image URL
    output_image_url: { type: String },

    // Did they pay or use a free credit?
    payment_type: { type: String, enum: ["free", "paid"], required: true },
    
    // Is the final image unlocked (paid or free trial unlocked)?
    is_unlocked: { type: Boolean, default: false },

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

generationSchema.index({ user_id: 1, created_at: -1 });

module.exports = mongoose.model("Generation", generationSchema);
