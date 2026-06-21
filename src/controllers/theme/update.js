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
      baby_angle_description,
    } = req.body;

    let theme = await Theme.findById(id);

    if (!theme) {
      return res.status(404).json({ message: "Theme not found" });
    }

    const coverFile = req.files && req.files.image ? req.files.image[0] : null;
    const previewFiles = req.files && req.files.previews ? req.files.previews : [];

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
      baby_angle_description: baby_angle_description !== undefined ? baby_angle_description : theme.baby_angle_description,
    };

    const { uploadBufferToFirebase } = require("../../utils/storageUtils");

    // Process new cover image if uploaded
    if (coverFile) {
      const safeFilename = coverFile.originalname.replace(/[^a-zA-Z0-9.]/g, "_");
      const cloudFileName = `theme_gallery/${Date.now()}_${safeFilename}`;
      await uploadBufferToFirebase(cloudFileName, coverFile.buffer, coverFile.mimetype);
      updateData.image_url = cloudFileName;

      // Delete old cover image from Firebase
      await deleteFromFirebase(theme.image_url);
    }

    // Process new previews if uploaded
    if (previewFiles && previewFiles.length > 0) {
      // Delete old preview images from Firebase Storage
      if (theme.preview_image_urls && theme.preview_image_urls.length > 0) {
        for (const oldPath of theme.preview_image_urls) {
          await deleteFromFirebase(oldPath);
        }
      }

      const previewCloudPaths = [];
      for (let i = 0; i < previewFiles.length; i++) {
        const pFile = previewFiles[i];
        const safePFilename = pFile.originalname.replace(/[^a-zA-Z0-9.]/g, "_");
        const cloudPName = `theme_gallery/${Date.now()}_preview_${i}_${safePFilename}`;
        await uploadBufferToFirebase(cloudPName, pFile.buffer, pFile.mimetype);
        previewCloudPaths.push(cloudPName);
      }
      updateData.preview_image_urls = previewCloudPaths;
    }

    theme = await Theme.findByIdAndUpdate(id, updateData, { new: true });
    const themeObj = theme.toObject();
    themeObj.image_url = await getFirebaseDownloadUrl(themeObj.image_url);
    
    // Resolve preview URLs
    themeObj.preview_image_urls = await Promise.all(
      (themeObj.preview_image_urls || []).map(path => getFirebaseDownloadUrl(path))
    );

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
