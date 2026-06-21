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
      baby_angle_description,
    } = req.body;

    const coverFile = req.files && req.files.image ? req.files.image[0] : null;
    const previewFiles = req.files && req.files.previews ? req.files.previews : [];

    if (!coverFile) {
      return res.status(400).json({
        message: "Theme image (cover) is required",
      });
    }

    const categoryExists = await ThemeCategory.findById(category_id);

    if (!categoryExists) {
      return res.status(400).json({
        message: "Invalid category selected",
      });
    }

    const { uploadBufferToFirebase } = require("../../utils/storageUtils");

    // Upload Cover Image
    const safeCoverFilename = coverFile.originalname.replace(/[^a-zA-Z0-9.]/g, "_");
    const cloudCoverName = `theme_gallery/${Date.now()}_${safeCoverFilename}`;
    await uploadBufferToFirebase(cloudCoverName, coverFile.buffer, coverFile.mimetype);

    // Upload Preview Images
    const previewCloudPaths = [];
    if (previewFiles && previewFiles.length > 0) {
      for (let i = 0; i < previewFiles.length; i++) {
        const pFile = previewFiles[i];
        const safePFilename = pFile.originalname.replace(/[^a-zA-Z0-9.]/g, "_");
        const cloudPName = `theme_gallery/${Date.now()}_preview_${i}_${safePFilename}`;
        await uploadBufferToFirebase(cloudPName, pFile.buffer, pFile.mimetype);
        previewCloudPaths.push(cloudPName);
      }
    }

    const newTheme = new Theme({
      label,
      category_id,
      description,
      image_url: cloudCoverName,
      prompt_template,
      badge: {
        label: badge_label || "",
        type: badge_type || "",
      },
      preview_image_urls: previewCloudPaths,
      baby_angle_description: baby_angle_description || "",
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
