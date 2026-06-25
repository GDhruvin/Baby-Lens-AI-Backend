const themeService = require("../services/theme.service");

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

module.exports = {
  renderCreateThemePage,
  createTheme,
  getAllThemes,
  getTrendingThemes,
  getSingleTheme,
  updateTheme,
  deleteTheme,
};
