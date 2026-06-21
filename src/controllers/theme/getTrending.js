// src/controllers/theme/getTrending.js

const Theme = require("../../models/Theme");
const { getFirebaseDownloadUrl } = require("../../utils/storageUtils");

module.exports = async (req, res) => {
  try {
    // Fetch top 4 themes sorted by generation_count in descending order
    const themes = await Theme.find({ is_active: true })
      .sort({ generation_count: -1 })
      .limit(4)
      .populate("category_id");

    const themesWithResolvedUrls = await Promise.all(
      themes.map(async (themeDoc) => {
        const themeObj = themeDoc.toObject();
        themeObj.image_url = await getFirebaseDownloadUrl(themeObj.image_url);
        
        // Resolve preview URLs
        themeObj.preview_image_urls = await Promise.all(
          (themeObj.preview_image_urls || []).map((path) => getFirebaseDownloadUrl(path))
        );
        
        return themeObj;
      })
    );

    return res.status(200).json({
      message: "Trending themes fetched successfully",
      count: themesWithResolvedUrls.length,
      data: themesWithResolvedUrls,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch trending themes",
      error: error.message,
    });
  }
};
