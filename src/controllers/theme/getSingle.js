// src/controllers/theme/getSingle.js

const Theme = require("../../models/Theme");
const { toSignedThemeImageUrl } = require("./utils");

module.exports = async (req, res) => {
  try {
    const { id } = req.params;
    const theme = await Theme.findById(id).populate("category_id");

    if (!theme) {
      return res.status(404).json({ message: "Theme not found" });
    }

    const themeObj = theme.toObject();
    themeObj.image_url = await toSignedThemeImageUrl(themeObj.image_url);

    return res.status(200).json({
      message: "Theme fetched successfully",
      data: themeObj,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch theme",
      error: error.message,
    });
  }
};
