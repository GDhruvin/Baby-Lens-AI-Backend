const Theme = require("../models/Theme");
const ThemeCategory = require("../models/ThemeCategory");
const admin = require("../config/firebase");

const toSignedThemeImageUrl = async (imageUrl) => {
  if (!imageUrl) return imageUrl;

  try {
    const parsed = new URL(imageUrl);
    const isFirebaseStorageHost =
      parsed.hostname === "firebasestorage.googleapis.com";
    const hasToken = parsed.searchParams.has("token");
    const isAlreadySigned = parsed.searchParams.has("X-Goog-Signature");

    if (!isFirebaseStorageHost || hasToken || isAlreadySigned) {
      return imageUrl;
    }

    const encodedPath = parsed.pathname.split("/o/")[1];
    if (!encodedPath) return imageUrl;

    const cloudPath = decodeURIComponent(encodedPath);
    const bucket = admin.storage().bucket();
    const [signedUrl] = await bucket.file(cloudPath).getSignedUrl({
      action: "read",
      expires: "01-01-2036",
    });

    return signedUrl || imageUrl;
  } catch (error) {
    console.warn("[Themes] Failed to normalize image URL:", error.message);
    return imageUrl;
  }
};

exports.renderCreateThemePage = async (req, res) => {
  try {
    const categories = await ThemeCategory.find({
      is_active: true,
    }).sort({ sort_order: 1 });

    return res.render("create-theme", {
      categories,
    });
  } catch (error) {
    return res.status(500).send(error.message);
  }
};

exports.createTheme = async (req, res) => {
  try {
    const {
      label,
      category_id,
      description,
      prompt_template,
      badge_label,
      badge_type,
    } = req.body;

    const file = req.file;

    if (!file) {
      return res.status(400).json({
        message: "Theme image is required",
      });
    }

    const categoryExists = await ThemeCategory.findById(category_id);

    if (!categoryExists) {
      return res.status(400).json({
        message: "Invalid category selected",
      });
    }

    const bucket = admin.storage().bucket();

    const safeFilename = file.originalname.replace(
      /[^a-zA-Z0-9.]/g,
      "_"
    );

    const cloudFileName = `theme_gallery/${Date.now()}_${safeFilename}`;

    const fileRef = bucket.file(cloudFileName);

    await fileRef.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
      },
    });



    const [imageUrl] = await fileRef.getSignedUrl({
      action: "read",
      expires: "01-01-2036", // Long lived URL
    });

    const newTheme = new Theme({
      label,
      category_id,
      description,
      image_url: imageUrl,
      prompt_template,
      badge: {
        label: badge_label || "",
        type: badge_type || "",
      },
    });

    await newTheme.save();

    return res.status(201).json({
      message: "Theme created successfully",
      data: newTheme,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to create theme",
      error: error.message,
    });
  }
};

exports.getAllThemes = async (req, res) => {
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

    const themes = await Theme.find(filter).populate("category_id");
    const themesWithResolvedUrls = await Promise.all(
      themes.map(async (themeDoc) => {
        const themeObj = themeDoc.toObject();
        themeObj.image_url = await toSignedThemeImageUrl(themeObj.image_url);
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

exports.getSingleTheme = async (req, res) => {
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

exports.updateTheme = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      label,
      category_id,
      description,
      prompt_template,
      badge_label,
      badge_type,
      is_active,
    } = req.body;

    let theme = await Theme.findById(id);

    if (!theme) {
      return res.status(404).json({ message: "Theme not found" });
    }

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
    };

    if (req.file) {
      const file = req.file;
      const bucket = admin.storage().bucket();
      const safeFilename = file.originalname.replace(/[^a-zA-Z0-9.]/g, "_");
      const cloudFileName = `theme_gallery/${Date.now()}_${safeFilename}`;
      const fileRef = bucket.file(cloudFileName);

      await fileRef.save(file.buffer, {
        metadata: { contentType: file.mimetype },
      });

      const [imageUrl] = await fileRef.getSignedUrl({
        action: "read",
        expires: "01-01-2036",
      });

      updateData.image_url = imageUrl;

      // Optional: Delete old image from Firebase
      try {
        if (theme.image_url) {
          const oldUrl = new URL(theme.image_url);
          const oldPath = decodeURIComponent(
            oldUrl.pathname.split("/o/")[1].split("?")[0]
          );
          await bucket.file(oldPath).delete();
        }
      } catch (err) {
        console.error("Failed to delete old image:", err.message);
      }
    }

    theme = await Theme.findByIdAndUpdate(id, updateData, { new: true });

    return res.status(200).json({
      message: "Theme updated successfully",
      data: theme,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update theme",
      error: error.message,
    });
  }
};

exports.deleteTheme = async (req, res) => {
  try {
    const { id } = req.params;
    const theme = await Theme.findById(id);

    if (!theme) {
      return res.status(404).json({ message: "Theme not found" });
    }

    // Delete image from Firebase
    try {
      if (theme.image_url) {
        const bucket = admin.storage().bucket();
        const url = new URL(theme.image_url);
        const path = decodeURIComponent(
          url.pathname.split("/o/")[1].split("?")[0]
        );
        await bucket.file(path).delete();
      }
    } catch (err) {
      console.error("Failed to delete image from Firebase:", err.message);
    }

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
