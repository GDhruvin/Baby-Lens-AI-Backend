// src/controllers/theme/delete.js

const Theme = require("../../models/Theme");
const admin = require("../../config/firebase");

module.exports = async (req, res) => {
  try {
    const { id } = req.params;
    const theme = await Theme.findById(id);

    if (!theme) {
      return res.status(404).json({ message: "Theme not found" });
    }

    // Delete image from Firebase
    try {
      if (theme.image_url) {
        const bucket = admin.storage().bucket();
        const url = new URL(theme.image_url);
        const path = decodeURIComponent(
          url.pathname.split("/o/")[1].split("?")[0]
        );
        await bucket.file(path).delete();
      }
    } catch (err) {
      console.error("Failed to delete image from Firebase:", err.message);
    }

    await Theme.findByIdAndDelete(id);

    return res.status(200).json({
      message: "Theme deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to delete theme",
      error: error.message,
    });
  }
};
