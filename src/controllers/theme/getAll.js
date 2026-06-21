// src/controllers/theme/getAll.js

const Theme = require("../../models/Theme");
const ThemeCategory = require("../../models/ThemeCategory");
// Removed toSignedThemeImageUrl

module.exports = async (req, res) => {
  try {
    const { search, category } = req.query;
    let filter = { is_active: true };

    // Search functionality (on label)
    if (search) {
      filter.label = { $regex: search, $options: "i" };
    }

    // Filter functionality (on category name)
    if (category) {
      const categoryDoc = await ThemeCategory.findOne({ 
        name: { $regex: `^${category}$`, $options: "i" } 
      });
      
      if (categoryDoc) {
        filter.category_id = categoryDoc._id;
      } else {
        // If category is provided but not found, return empty data
        return res.status(200).json({
          message: "No themes found for the specified category",
          data: [],
        });
      }
    }

    const { getFirebaseDownloadUrl } = require("../../utils/storageUtils");

        const themes = await Theme.find(filter).populate("category_id");
    const themesWithResolvedUrls = await Promise.all(
      themes.map(async (themeDoc) => {
        const themeObj = themeDoc.toObject();
        themeObj.image_url = await getFirebaseDownloadUrl(themeObj.image_url);
        
        // Resolve previews to download URLs
        themeObj.preview_image_urls = await Promise.all(
          (themeObj.preview_image_urls || []).map(path => getFirebaseDownloadUrl(path))
        );
        
        return themeObj;
      })
    );
    
    return res.status(200).json({
      message: "Themes fetched successfully",
      count: themesWithResolvedUrls.length,
      data: themesWithResolvedUrls,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch themes",
      error: error.message,
    });
  }
};
