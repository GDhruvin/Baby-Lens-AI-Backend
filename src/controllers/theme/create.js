// src/controllers/theme/create.js

const Theme = require("../../models/Theme");
const ThemeCategory = require("../../models/ThemeCategory");
const admin = require("../../config/firebase");

module.exports = async (req, res) => {
  try {
    const {
      label,
      category_id,
      description,
      prompt_template,
      badge_label,
      badge_type,
    } = req.body;

    const file = req.file;

    if (!file) {
      return res.status(400).json({
        message: "Theme image is required",
      });
    }

    const categoryExists = await ThemeCategory.findById(category_id);

    if (!categoryExists) {
      return res.status(400).json({
        message: "Invalid category selected",
      });
    }

    const bucket = admin.storage().bucket();

    const safeFilename = file.originalname.replace(
      /[^a-zA-Z0-9.]/g,
      "_"
    );

    const cloudFileName = `theme_gallery/${Date.now()}_${safeFilename}`;

    const { uploadBufferToFirebase } = require("../../utils/storageUtils");
    const downloadUrl = await uploadBufferToFirebase(cloudFileName, file.buffer, file.mimetype);

    const newTheme = new Theme({
      label,
      category_id,
      description,
      image_url: cloudFileName, // Now stores cloud path
      prompt_template,
      badge: {
        label: badge_label || "",
        type: badge_type || "",
      },
    });

    await newTheme.save();

    return res.status(201).json({
      message: "Theme created successfully",
      data: newTheme,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to create theme",
      error: error.message,
    });
  }
};
