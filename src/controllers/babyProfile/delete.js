// src/controllers/babyProfile/delete.js

const admin = require("../../config/firebase");
const BabyProfile = require("../../models/BabyProfile");
// Removed unused deleteUploadedImage

module.exports = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const profile = await BabyProfile.findById(id);

    if (!profile) {
      return res.status(404).json({
        message: "Baby profile not found",
      });
    }

    if (String(profile.user_id) !== String(userId)) {
      return res.status(403).json({
        message: "You do not have permission to delete this profile",
      });
    }

    // Delete from Firebase Storage if URL/path exists
    if (profile.reference_image_url) {
      const { deleteFromFirebase } = require("../../utils/storageUtils");
      await deleteFromFirebase(profile.reference_image_url);
    }

    await BabyProfile.findByIdAndDelete(id);

    return res.status(200).json({
      message: "Baby profile deleted successfully",
    });
  } catch (error) {
    console.error("Delete baby profile error:", error);

    return res.status(500).json({
      message: "Failed to delete baby profile",
      error: error.message,
    });
  }
};
