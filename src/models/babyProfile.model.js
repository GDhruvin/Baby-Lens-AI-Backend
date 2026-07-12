const mongoose = require("mongoose");

const babyProfileSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reference_image_url: {
      type: String,
      required: true, // The URL of the uploaded photo in Firebase Storage
    },
    identity_json: {
      type: Object,
      required: true, // This saves the EXACT output from Gemini 1.5 Flash so we never have to run it again
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  },
);

module.exports = mongoose.model("BabyProfile", babyProfileSchema);
