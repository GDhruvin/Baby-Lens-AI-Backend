const Theme = require("../models/theme.model");
const ThemeCategory = require("../models/themeCategory.model");
const Banner = require("../models/banner.model");
const {
  uploadBufferToFirebase,
  deleteFromFirebase,
  getFirebaseDownloadUrl,
} = require("../utils/storageUtils");

/**
 * Get active categories for rendering creation page
 */
async function getActiveCategories() {
  return await ThemeCategory.find({ is_active: true }).sort({ sort_order: 1 });
}

/**
 * Create a new theme
 */
async function createTheme({ body, files }) {
  const {
    label,
    category_id,
    description,
    prompt_template,
    badge_label,
    badge_type,
    baby_angle_description,
    set_as_banner,
  } = body;

  const coverFile = files && files.image ? files.image[0] : null;
  const previewFiles = files && files.previews ? files.previews : [];

  if (!coverFile) {
    const error = new Error("Theme image (cover) is required");
    error.status = 400;
    throw error;
  }

  const categoryExists = await ThemeCategory.findById(category_id);
  if (!categoryExists) {
    const error = new Error("Invalid category selected");
    error.status = 400;
    throw error;
  }

  // Upload Cover Image
  const safeCoverFilename = coverFile.originalname.replace(/[^a-zA-Z0-9.]/g, "_");
  const cloudCoverName = `theme_gallery/${Date.now()}_${safeCoverFilename}`;
  await uploadBufferToFirebase(cloudCoverName, coverFile.buffer, coverFile.mimetype);

  // Upload Preview Images
  const previewCloudPaths = [];
  if (previewFiles && previewFiles.length > 0) {
    for (let i = 0; i < previewFiles.length; i++) {
      const pFile = previewFiles[i];
      const safePFilename = pFile.originalname.replace(/[^a-zA-Z0-9.]/g, "_");
      const cloudPName = `theme_gallery/${Date.now()}_preview_${i}_${safePFilename}`;
      await uploadBufferToFirebase(cloudPName, pFile.buffer, pFile.mimetype);
      previewCloudPaths.push(cloudPName);
    }
  }

  const newTheme = new Theme({
    label,
    category_id,
    description,
    image_url: cloudCoverName,
    prompt_template,
    badge: {
      label: badge_label || "",
      type: badge_type || "",
    },
    preview_image_urls: previewCloudPaths,
    baby_angle_description: baby_angle_description || "",
  });

  await newTheme.save();

  // Auto-set as active Banner if category is Festival or explicitly requested
  const isFestivalCategory = (categoryExists.name || "").toLowerCase().includes("festival");
  if (isFestivalCategory || set_as_banner === "true" || set_as_banner === true) {
    let existingBanner = await Banner.findOne();
    if (existingBanner) {
      existingBanner.target_theme_id = newTheme._id;
      existingBanner.target_category = categoryExists.name;
      existingBanner.title = `${label}\nSpecial`;
      existingBanner.label = badge_label || "✦ LIMITED EDITION";
      existingBanner.is_active = true;
      await existingBanner.save();
    } else {
      await Banner.create({
        target_theme_id: newTheme._id,
        target_category: categoryExists.name,
        title: `${label}\nSpecial`,
        label: badge_label || "✦ LIMITED EDITION",
        description: description || "Stunning festive memories with our AI-powered theme collection.",
        cta_text: "Try Now →",
        is_active: true,
      });
    }
  }

  return newTheme;
}

/**
 * Get all active themes (optional search & category filter)
 */
async function getAllThemes({ search, category }) {
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
      return []; // Category provided but not found, return empty list
    }
  }

  const themes = await Theme.find(filter).populate("category_id");
  
  return await Promise.all(
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
}

/**
 * Get trending themes (themes with badge "trending" + top 5 sorted by generation_count)
 */
async function getTrendingThemes() {
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

  return await Promise.all(
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
}

/**
 * Get single theme by ID
 */
async function getThemeById(id) {
  const theme = await Theme.findById(id).populate("category_id");
  if (!theme) return null;

  const themeObj = theme.toObject();
  themeObj.image_url = await getFirebaseDownloadUrl(themeObj.image_url);
  
  // Resolve previews to download URLs
  themeObj.preview_image_urls = await Promise.all(
    (themeObj.preview_image_urls || []).map(path => getFirebaseDownloadUrl(path))
  );

  return themeObj;
}

/**
 * Update theme
 */
async function updateTheme({ id, body, files }) {
  const {
    label,
    category_id,
    description,
    prompt_template,
    badge_label,
    badge_type,
    is_active,
    baby_angle_description,
  } = body;

  let theme = await Theme.findById(id);
  if (!theme) {
    const error = new Error("Theme not found");
    error.status = 404;
    throw error;
  }

  const coverFile = files && files.image ? files.image[0] : null;
  const previewFiles = files && files.previews ? files.previews : [];

  const updateData = {
    label: label || theme.label,
    category_id: category_id || theme.category_id,
    description: description || theme.description,
    prompt_template: prompt_template || theme.prompt_template,
    badge: {
      label: badge_label !== undefined ? badge_label : theme.badge.label,
      type: badge_type !== undefined ? badge_type : theme.badge.type,
    },
    is_active: is_active !== undefined ? is_active : theme.is_active,
    baby_angle_description: baby_angle_description !== undefined ? baby_angle_description : theme.baby_angle_description,
  };

  // Process new cover image if uploaded
  if (coverFile) {
    const safeFilename = coverFile.originalname.replace(/[^a-zA-Z0-9.]/g, "_");
    const cloudFileName = `theme_gallery/${Date.now()}_${safeFilename}`;
    await uploadBufferToFirebase(cloudFileName, coverFile.buffer, coverFile.mimetype);
    updateData.image_url = cloudFileName;

    // Delete old cover image from Firebase
    if (theme.image_url) {
      await deleteFromFirebase(theme.image_url);
    }
  }

  // Process new previews if uploaded
  if (previewFiles && previewFiles.length > 0) {
    // Delete old preview images from Firebase Storage
    if (theme.preview_image_urls && theme.preview_image_urls.length > 0) {
      for (const oldPath of theme.preview_image_urls) {
        await deleteFromFirebase(oldPath);
      }
    }

    const previewCloudPaths = [];
    for (let i = 0; i < previewFiles.length; i++) {
      const pFile = previewFiles[i];
      const safePFilename = pFile.originalname.replace(/[^a-zA-Z0-9.]/g, "_");
      const cloudPName = `theme_gallery/${Date.now()}_preview_${i}_${safePFilename}`;
      await uploadBufferToFirebase(cloudPName, pFile.buffer, pFile.mimetype);
      previewCloudPaths.push(cloudPName);
    }
    updateData.preview_image_urls = previewCloudPaths;
  }

  theme = await Theme.findByIdAndUpdate(id, updateData, { new: true });
  const themeObj = theme.toObject();
  themeObj.image_url = await getFirebaseDownloadUrl(themeObj.image_url);
  
  // Resolve preview URLs
  themeObj.preview_image_urls = await Promise.all(
    (themeObj.preview_image_urls || []).map(path => getFirebaseDownloadUrl(path))
  );

  return themeObj;
}

/**
 * Delete theme
 */
async function deleteTheme(id) {
  const theme = await Theme.findById(id);
  if (!theme) {
    const error = new Error("Theme not found");
    error.status = 404;
    throw error;
  }

  // Clean up cover image
  if (theme.image_url) {
    await deleteFromFirebase(theme.image_url);
  }

  // Clean up previews if they exist
  if (theme.preview_image_urls && theme.preview_image_urls.length > 0) {
    for (const path of theme.preview_image_urls) {
      await deleteFromFirebase(path);
    }
  }

  await Theme.findByIdAndDelete(id);
  return true;
}

/**
 * Get active banner
 */
async function getActiveBanner() {
  const banner = await Banner.findOne({ is_active: true }).populate({
    path: "target_theme_id",
    populate: { path: "category_id" },
  });

  if (!banner) return null;

  const bannerObj = banner.toObject();

  // Resolve target_theme_id image URLs to Firebase download URLs
  if (bannerObj.target_theme_id) {
    if (bannerObj.target_theme_id.image_url) {
      bannerObj.target_theme_id.image_url = await getFirebaseDownloadUrl(
        bannerObj.target_theme_id.image_url
      );
    }
    if (bannerObj.target_theme_id.preview_image_urls) {
      bannerObj.target_theme_id.preview_image_urls = await Promise.all(
        bannerObj.target_theme_id.preview_image_urls.map((p) =>
          getFirebaseDownloadUrl(p)
        )
      );
    }
  }

  // Resolve image URL for banner
  if (bannerObj.image_url) {
    bannerObj.image_url = await getFirebaseDownloadUrl(bannerObj.image_url);
  } else if (bannerObj.target_theme_id && bannerObj.target_theme_id.image_url) {
    bannerObj.image_url = bannerObj.target_theme_id.image_url;
  }

  return bannerObj;
}

/**
 * Update/Upsert Banner Configuration
 */
async function updateBanner({ body, file }) {
  const { label, title, description, cta_text, target_theme_id, target_category, is_active } = body;

  let banner = await Banner.findOne();
  if (!banner) {
    banner = new Banner({});
  }

  if (label !== undefined) banner.label = label;
  if (title !== undefined) banner.title = title;
  if (description !== undefined) banner.description = description;
  if (cta_text !== undefined) banner.cta_text = cta_text;
  if (target_theme_id !== undefined && target_theme_id !== "") banner.target_theme_id = target_theme_id;
  if (target_category !== undefined) banner.target_category = target_category;
  banner.is_active = is_active === "true" || is_active === true;

  if (file) {
    const safeFilename = file.originalname.replace(/[^a-zA-Z0-9.]/g, "_");
    const cloudFileName = `theme_gallery/${Date.now()}_banner_${safeFilename}`;
    await uploadBufferToFirebase(cloudFileName, file.buffer, file.mimetype);
    
    if (banner.image_url) {
      await deleteFromFirebase(banner.image_url);
    }
    banner.image_url = cloudFileName;
  }

  await banner.save();
  return await getActiveBanner();
}

module.exports = {
  getActiveCategories,
  createTheme,
  getAllThemes,
  getTrendingThemes,
  getThemeById,
  updateTheme,
  deleteTheme,
  getActiveBanner,
  updateBanner,
};
