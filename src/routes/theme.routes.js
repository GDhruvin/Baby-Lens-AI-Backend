const express = require("express");
const router = express.Router();
const multer = require("multer");
const themeController = require("../controllers/theme.controller");
const { requireAuth } = require("../middlewares/auth.middleware");

// Multer Config (Memory Storage for Firebase Upload, 10MB limit, image types validation)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
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

// GET /api/themes/create (Render the create theme HTML page)
router.get("/create", themeController.renderCreateThemePage);

// POST /api/themes/create (Create new theme with cover and preview assets)
router.post(
  "/create",
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "previews", maxCount: 4 },
  ]),
  themeController.createTheme
);

// GET /api/themes (Get all active themes)
router.get("/", themeController.getAllThemes);

// GET /api/themes/trending (Get trending themes)
router.get("/trending", themeController.getTrendingThemes);

// GET /api/themes/:id (Get single theme details)
router.get("/:id", themeController.getSingleTheme);

// PUT /api/themes/:id (Update theme, optionally replacing images)
router.put(
  "/:id",
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "previews", maxCount: 4 },
  ]),
  themeController.updateTheme
);

// DELETE /api/themes/:id (Delete theme and assets)
router.delete("/:id", themeController.deleteTheme);

module.exports = router;
