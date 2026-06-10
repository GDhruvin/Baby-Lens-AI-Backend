// src/routes/themeRoutes.js

const express = require("express");
const router = express.Router();
const multer = require("multer");

const renderCreateThemePage = require("../controllers/theme/render");
const createTheme = require("../controllers/theme/create");
const getAllThemes = require("../controllers/theme/getAll");
const getSingleTheme = require("../controllers/theme/getSingle");
const updateTheme = require("../controllers/theme/update");
const deleteTheme = require("../controllers/theme/delete");

const { requireAuth } = require("../middlewares/authMiddleware");

// ======================================================
// MULTER CONFIG (Memory Storage for Firebase Upload)
// ======================================================

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, JPEG, PNG, and WEBP image files are allowed"));
    }
  },
});

/**
 * GET /api/themes/create
 * Render the create theme HTML page
 */
router.get("/create", renderCreateThemePage);

/**
 * POST /api/themes/create
 * Create new theme
 *
 * form-data:
 * - label (required)
 * - category (required)
 * - description (required)
 * - prompt_template (required)
 * - badge_label (optional)
 * - badge_type (optional)
 * - image (required)
 */
router.post("/create", upload.single("image"), createTheme);

/**
 * GET /api/themes
 * Get all themes
 */
router.get("/", getAllThemes);

/**
 * GET /api/themes/:id
 * Get single theme details
 */
router.get("/:id", getSingleTheme);

/**
 * PUT /api/themes/:id
 * Update theme
 */
router.put("/:id", upload.single("image"), updateTheme);

/**
 * DELETE /api/themes/:id
 * Delete theme
 */
router.delete("/:id", deleteTheme);

module.exports = router;
