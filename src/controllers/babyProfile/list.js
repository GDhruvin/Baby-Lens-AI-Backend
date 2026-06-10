// src/controllers/babyProfile/list.js

const BabyProfile = require("../../models/BabyProfile");
const { getFirebaseDownloadUrl } = require("../../utils/storageUtils");

module.exports = async (req, res) => {
  try {
    const userId = req.user.id;

    const profiles = await BabyProfile.find({ user_id: userId })
      .sort({ created_at: -1 })
      .select("_id user_id reference_image_url identity_json created_at updated_at")
      .lean();

    const profilesWithResolvedUrls = await Promise.all(
      profiles.map(async (profile) => ({
        ...profile,
        reference_image_url: await getFirebaseDownloadUrl(profile.reference_image_url),
      })),
    );

    return res.status(200).json({
      message: "Baby profiles fetched successfully",
      total_profiles: profilesWithResolvedUrls.length,
      profiles: profilesWithResolvedUrls,
    });
  } catch (error) {
    console.error("List baby profiles error:", error);

    return res.status(500).json({
      message: "Failed to fetch baby profiles",
      error: error.message,
    });
  }
};
