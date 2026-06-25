const babyProfileService = require("../services/babyProfile.service");

/**
 * Upload and analyze baby photo using Gemini
 */
async function analyze(req, res, next) {
  try {
    const userId = req.user.id;
    const file = req.file;

    const result = await babyProfileService.analyzeBabyProfile({ userId, file });

    return res.status(200).json({
      message: result.useRealGemini
        ? "Baby face analyzed successfully via Vertex AI"
        : "Baby face analyzed successfully (Mock Mode)",
      profile_id: result.profile_id,
      image_url: result.image_url,
      analysis: result.analysis,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get all baby profiles for the logged in user
 */
async function list(req, res, next) {
  try {
    const userId = req.user.id;
    const profiles = await babyProfileService.getBabyProfiles(userId);

    return res.status(200).json({
      message: "Baby profiles fetched successfully",
      total_profiles: profiles.length,
      profiles,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update baby profile fields (selective update of identity_json properties)
 */
async function update(req, res, next) {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const userId = req.user.id;

    const profile = await babyProfileService.updateBabyProfile({ userId, profileId: id, updateData });

    return res.status(200).json({
      message: "Baby profile updated successfully",
      profile,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete baby profile
 */
async function deleteProfile(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    await babyProfileService.deleteBabyProfile({ userId, profileId: id });

    return res.status(200).json({
      message: "Baby profile deleted successfully",
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  analyze,
  list,
  update,
  deleteProfile,
};
