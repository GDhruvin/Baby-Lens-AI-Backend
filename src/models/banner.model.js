const mongoose = require("mongoose");

const BannerSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      default: "✦ LIMITED EDITION",
      trim: true,
    },
    title: {
      type: String,
      required: true,
      default: "Festival\nSpecial",
      trim: true,
    },
    description: {
      type: String,
      default: "Stunning festive memories with our AI-powered theme collection.",
      trim: true,
    },
    cta_text: {
      type: String,
      default: "Try Now →",
      trim: true,
    },
    image_url: {
      type: String,
      default: "", // Firebase Storage path or URL
    },
    target_theme_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Theme",
      default: null,
    },
    target_category: {
      type: String,
      default: "Festival",
      trim: true,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    sort_order: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

module.exports = mongoose.model("Banner", BannerSchema);
