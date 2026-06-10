// src/controllers/theme/delete.js

const Theme = require("../../models/Theme");
const { deleteFromFirebase } = require("../../utils/storageUtils");

module.exports = async (req, res) => {
  try {
    const { id } = req.params;
    const theme = await Theme.findById(id);

    if (!theme) {
      return res.status(404).json({ message: "Theme not found" });
    }

    await deleteFromFirebase(theme.image_url);

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
