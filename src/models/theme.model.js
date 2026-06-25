const mongoose = require("mongoose");

const themeSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 60,
    },

    category_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ThemeCategory",
      required: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 300,
    },

    image_url: {
      type: String,
      required: true,
    },

    prompt_template: {
      type: String,
      required: true,
      minlength: 20,
      maxlength: 5000,
    },

    badge: {
      label: {
        type: String,
        default: "",
      },

      type: {
        type: String,
        default: "",
      },
    },

    is_active: {
      type: Boolean,
      default: true,
    },

    preview_image_urls: {
      type: [String],
      default: [],
    },

    baby_angle_description: {
      type: String,
      default: "",
      trim: true,
    },

    generation_count: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Theme", themeSchema);
