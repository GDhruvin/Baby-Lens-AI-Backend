const themeService = require("../services/theme.service");
const notificationService = require("../services/notification.service");
const { getFirebaseDownloadUrl } = require("../utils/storageUtils");

/**
 * Renders the HTML page to create a new theme
 */
async function renderCreateThemePage(req, res, next) {
  try {
    const categories = await themeService.getActiveCategories();
    return res.render("create-theme", {
      categories,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Create a new theme
 */
async function createTheme(req, res, next) {
  try {
    const newTheme = await themeService.createTheme({
      body: req.body,
      files: req.files,
    });

    const shouldNotify =
      req.body.send_push_notification === "true" ||
      req.body.send_push_notification === true ||
      req.body.send_push_notification === "on";

    if (shouldNotify) {
      let previewImageUrl = null;
      if (newTheme.image_url) {
        try {
          previewImageUrl = await getFirebaseDownloadUrl(newTheme.image_url);
        } catch (urlErr) {
          console.warn("[ThemeController] Failed to resolve firebase image URL for push:", urlErr?.message);
        }
      }

      notificationService
        .notifyNewTheme({
          themeId: newTheme._id,
          themeLabel: newTheme.label,
          previewImageUrl,
        })
        .catch((pushErr) => {
          console.warn("[ThemeController] Push broadcast failed:", pushErr?.message);
        });
    }

    if (req.accepts("html", "json") === "html" && !req.xhr) {
      return res.redirect("/api/themes/create?success=true");
    }

    return res.status(201).json({
      message: "Theme created successfully",
      data: newTheme,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get all active themes (optional search & category filter)
 */
async function getAllThemes(req, res, next) {
  try {
    const { search, category } = req.query;
    const themes = await themeService.getAllThemes({ search, category });

    return res.status(200).json({
      message: "Themes fetched successfully",
      count: themes.length,
      data: themes,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get trending and high generation-count themes
 */
async function getTrendingThemes(req, res, next) {
  try {
    const themes = await themeService.getTrendingThemes();
    return res.status(200).json({
      message: "Trending themes fetched successfully",
      count: themes.length,
      data: themes,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get single theme details by ID
 */
async function getSingleTheme(req, res, next) {
  try {
    const { id } = req.params;
    const theme = await themeService.getThemeById(id);

    if (!theme) {
      const error = new Error("Theme not found");
      error.status = 404;
      throw error;
    }

    return res.status(200).json({
      message: "Theme fetched successfully",
      data: theme,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update theme fields, optionally replacing cover and preview assets in Firebase
 */
async function updateTheme(req, res, next) {
  try {
    const { id } = req.params;
    const theme = await themeService.updateTheme({
      id,
      body: req.body,
      files: req.files,
    });

    return res.status(200).json({
      message: "Theme updated successfully",
      data: theme,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete theme and its Firebase storage assets
 */
async function deleteTheme(req, res, next) {
  try {
    const { id } = req.params;
    await themeService.deleteTheme(id);

    return res.status(200).json({
      message: "Theme deleted successfully",
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Render the HTML page to manage the Festival Special Banner
 */
async function renderManageBannerPage(req, res, next) {
  try {
    const themes = await themeService.getAllThemes({});
    const banner = await themeService.getActiveBanner();
    const success = req.query.success === "true";
    return res.render("manage-banner", {
      themes,
      banner,
      success,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get active featured banner (renders HTML form in browser, JSON for mobile API)
 */
async function getActiveBanner(req, res, next) {
  try {
    const banner = await themeService.getActiveBanner();

    // If requested via browser tab (HTML Accept header), render management form
    if (req.accepts("html", "json") === "html") {
      const themes = await themeService.getAllThemes({});
      return res.render("manage-banner", {
        themes,
        banner,
        success: req.query.success === "true",
      });
    }

    // Return JSON payload for mobile API requests
    return res.status(200).json({
      message: "Banner retrieved successfully",
      data: banner,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update active featured banner
 */
async function updateBanner(req, res, next) {
  try {
    const file = req.files && req.files.image ? req.files.image[0] : req.file;
    const banner = await themeService.updateBanner({
      body: req.body,
      file,
    });

    const shouldNotify =
      req.body.send_festival_push === "true" ||
      req.body.send_festival_push === true ||
      req.body.send_festival_push === "on";

    if (shouldNotify && banner && banner.target_theme_id) {
      const themeTitle = banner.title || "Festival Special";
      const targetThemeId = (banner.target_theme_id._id || banner.target_theme_id).toString();

      notificationService
        .sendToTopic("new_themes", {
          title: `🪔 ${themeTitle}!`,
          body: banner.description || "Celebrate this festival season with our special baby photoshoot theme!",
          data: {
            type: "NEW_THEME",
            theme_id: targetThemeId,
          },
        })
        .catch((pushErr) => {
          console.warn("[ThemeController] Festival banner push failed:", pushErr?.message);
        });
    }

    // Redirect back to management page with success flag for browser form submits
    if (req.accepts("html", "json") === "html" && !req.xhr) {
      return res.redirect("/api/themes/banner/manage?success=true");
    }

    return res.status(200).json({
      message: "Banner configuration updated successfully",
      data: banner,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Render the HTML page to broadcast push notifications for existing themes
 */
async function renderBroadcastPage(req, res, next) {
  try {
    const themes = await themeService.getAllThemes({});
    const success = req.query.success === "true";
    return res.render("broadcast-theme", {
      themes,
      success,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Broadcast push notification for an existing theme
 */
async function broadcastExistingTheme(req, res, next) {
  try {
    const { theme_id, notification_title, notification_body, set_as_banner } = req.body || {};

    if (!theme_id) {
      return res.status(400).json({ message: "theme_id is required" });
    }

    const theme = await themeService.getThemeById(theme_id);
    if (!theme) {
      return res.status(404).json({ message: "Theme not found" });
    }

    const title =
      notification_title && notification_title.trim()
        ? notification_title.trim()
        : `🌟 Celebrate with ${theme.label}!`;

    const body =
      notification_body && notification_body.trim()
        ? notification_body.trim()
        : `Turn your baby's photo into our beloved ${theme.label} photoshoot portrait today. Tap to preview!`;

    // 1. Dispatch push notification to all parents
    await notificationService.sendToTopic("new_themes", {
      title,
      body,
      data: {
        type: "NEW_THEME",
        theme_id: String(theme._id),
        theme_label: String(theme.label),
      },
    });

    // 2. Optionally also set this theme as the active homepage banner
    if (set_as_banner === "true" || set_as_banner === true || set_as_banner === "on") {
      await themeService.updateBanner({
        body: {
          target_theme_id: theme._id,
          label: "✦ FESTIVAL SPECIAL",
          title: title,
          description: body,
          cta_text: "Try Theme →",
          is_active: "true",
        },
      });
    }

    if (req.accepts("html", "json") === "html" && !req.xhr) {
      return res.redirect("/api/themes/broadcast?success=true");
    }

    return res.status(200).json({
      message: "Push notification broadcast sent successfully to all parents",
      theme: { id: theme._id, label: theme.label },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  renderCreateThemePage,
  createTheme,
  getAllThemes,
  getTrendingThemes,
  getSingleTheme,
  updateTheme,
  deleteTheme,
  renderManageBannerPage,
  getActiveBanner,
  updateBanner,
  renderBroadcastPage,
  broadcastExistingTheme,
};
