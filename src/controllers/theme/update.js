// src/controllers/theme/update.js

const Theme = require("../../models/Theme");
const admin = require("../../config/firebase");

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

      const [imageUrl] = await fileRef.getSignedUrl({
        action: "read",
        expires: "01-01-2036",
      });

      updateData.image_url = imageUrl;

      // Optional: Delete old image from Firebase
      try {
        if (theme.image_url) {
          const oldUrl = new URL(theme.image_url);
          const oldPath = decodeURIComponent(
            oldUrl.pathname.split("/o/")[1].split("?")[0]
          );
          await bucket.file(oldPath).delete();
        }
      } catch (err) {
        console.error("Failed to delete old image:", err.message);
      }
    }

    theme = await Theme.findByIdAndUpdate(id, updateData, { new: true });

    return res.status(200).json({
      message: "Theme updated successfully",
      data: theme,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update theme",
      error: error.message,
    });
  }
};
