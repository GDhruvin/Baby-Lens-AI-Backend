// src/controllers/babyProfile/delete.js

const admin = require("../../config/firebase");
const BabyProfile = require("../../models/BabyProfile");
const { deleteUploadedImage } = require("./utils");

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

    // Delete from Firebase Storage if URL exists
    if (profile.reference_image_url) {
      try {
        const bucket = admin.storage().bucket();
        const url = new URL(profile.reference_image_url);
        const isFirebaseStorageHost = url.hostname === "firebasestorage.googleapis.com";
        
        if (isFirebaseStorageHost) {
          const encodedPath = url.pathname.split("/o/")[1];
          if (encodedPath) {
            const cloudPath = decodeURIComponent(encodedPath.split("?")[0]);
            await deleteUploadedImage(bucket, cloudPath);
          }
        }
      } catch (err) {
        console.error("Failed to parse image URL for deletion:", err.message);
      }
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
