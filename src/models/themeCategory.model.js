const mongoose = require("mongoose");

const themeCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    is_active: {
      type: Boolean,
      default: true,
    },

    sort_order: {
      type: Number,
      default: 0,
    },

    icon_url: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "ThemeCategory",
  themeCategorySchema
);
