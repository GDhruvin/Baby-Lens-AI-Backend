// src/controllers/generation/delete.js

const Generation = require("../../models/Generation");
const { deleteFromFirebase } = require("../../utils/storageUtils");

module.exports = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const generation = await Generation.findById(id);

    if (!generation) {
      return res.status(404).json({
        message: "Generation not found",
      });
    }

    if (String(generation.user_id) !== String(userId)) {
      return res.status(403).json({
        message: "You do not have permission to delete this generation",
      });
    }

    // Delete from Firebase Storage if URL/path exists
    if (generation.output_image_url) {
      await deleteFromFirebase(generation.output_image_url);
    }

    await Generation.findByIdAndDelete(id);

    return res.status(200).json({
      message: "Generation deleted successfully",
    });
  } catch (error) {
    console.error("Delete generation error:", error);

    return res.status(500).json({
      message: "Failed to delete generation",
      error: error.message,
    });
  }
};
