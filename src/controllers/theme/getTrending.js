// src/controllers/theme/getTrending.js

const Theme = require("../../models/Theme");
const { getFirebaseDownloadUrl } = require("../../utils/storageUtils");

module.exports = async (req, res) => {
  try {
    // Fetch active themes with badge type "trending"
    const trendingBadgeThemes = await Theme.find({
      is_active: true,
      "badge.type": "trending",
    }).populate("category_id");

    // Fetch top 5 active themes sorted by generation_count in descending order
    const topGenerationThemes = await Theme.find({ is_active: true })
      .sort({ generation_count: -1 })
      .limit(5)
      .populate("category_id");

    // Merge lists and deduplicate by _id
    const seenIds = new Set();
    const combinedThemes = [];

    for (const themeDoc of [...trendingBadgeThemes, ...topGenerationThemes]) {
      const idStr = themeDoc._id.toString();
      if (!seenIds.has(idStr)) {
        seenIds.add(idStr);
        combinedThemes.push(themeDoc);
      }
    }

    const themesWithResolvedUrls = await Promise.all(
      combinedThemes.map(async (themeDoc) => {
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
