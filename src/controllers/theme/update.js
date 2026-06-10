// src/controllers/theme/update.js

const Theme = require("../../models/Theme");
const admin = require("../../config/firebase");
const {
  deleteFromFirebase,
  getFirebaseDownloadUrl,
} = require("../../utils/storageUtils");

module.exports = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      label,
      category_id,
      description,
      prompt_template,
      badge_label,
      badge_type,
      is_active,
    } = req.body;

    let theme = await Theme.findById(id);

    if (!theme) {
      return res.status(404).json({ message: "Theme not found" });
    }

    const updateData = {
      label: label || theme.label,
      category_id: category_id || theme.category_id,
      description: description || theme.description,
      prompt_template: prompt_template || theme.prompt_template,
      badge: {
        label: badge_label !== undefined ? badge_label : theme.badge.label,
        type: badge_type !== undefined ? badge_type : theme.badge.type,
      },
      is_active: is_active !== undefined ? is_active : theme.is_active,
    };

    if (req.file) {
      const file = req.file;
      const bucket = admin.storage().bucket();
      const safeFilename = file.originalname.replace(/[^a-zA-Z0-9.]/g, "_");
      const cloudFileName = `theme_gallery/${Date.now()}_${safeFilename}`;
      const fileRef = bucket.file(cloudFileName);

      await fileRef.save(file.buffer, {
        metadata: { contentType: file.mimetype },
      });

      updateData.image_url = cloudFileName;

      // Optional: Delete old image from Firebase
      await deleteFromFirebase(theme.image_url);
    }

    theme = await Theme.findByIdAndUpdate(id, updateData, { new: true });
    const themeObj = theme.toObject();
    themeObj.image_url = await getFirebaseDownloadUrl(themeObj.image_url);

    return res.status(200).json({
      message: "Theme updated successfully",
      data: themeObj,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update theme",
      error: error.message,
    });
  }
};
