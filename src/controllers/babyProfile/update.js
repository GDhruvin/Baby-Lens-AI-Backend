const BabyProfile = require("../../models/BabyProfile");

module.exports = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const userId = req.user.id;

    // Find the profile and ensure it belongs to the user
    const profile = await BabyProfile.findOne({ _id: id, user_id: userId });
    
    if (!profile) {
      return res.status(404).json({ message: "Baby profile not found" });
    }

    let isModified = false;

    // Update identity_json properties selectively if it's passed
    if (updateData.identity_json) {
      profile.identity_json = { ...profile.identity_json, ...updateData.identity_json };
      isModified = true;
    } else {
      // If they passed flat properties, we might update them inside identity_json
      const allowedIdentityFields = ["age_range", "gender", "face_lock", "skin_tone", "texture_lock", "expression_lock"];
      
      for (const key of Object.keys(updateData)) {
        if (allowedIdentityFields.includes(key)) {
          if (!profile.identity_json) profile.identity_json = {};
          profile.identity_json[key] = updateData[key];
          isModified = true;
        }
      }
    }

    if (isModified) {
      // Since identity_json is a Mixed/Object type, we need to mark it modified to save it in mongoose
      profile.markModified('identity_json');
      await profile.save();
    }

    return res.status(200).json({
      message: "Baby profile updated successfully",
      profile
    });
  } catch (error) {
    console.error("Update Profile Error:", error);
    return res.status(500).json({
      message: "Failed to update baby profile",
      error: error.message,
    });
  }
};
