const express = require("express");
const router = express.Router();
const multer = require("multer");
const themeController = require("../controllers/theme.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireAdminAuth } = require("../middlewares/adminAuth.middleware");

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

// GET /api/themes/create (Render the create theme HTML page) [ADMIN]
router.get("/create", requireAdminAuth, themeController.renderCreateThemePage);

// POST /api/themes/create (Create new theme with cover and preview assets) [ADMIN]
router.post(
  "/create",
  requireAdminAuth,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "previews", maxCount: 4 },
  ]),
  themeController.createTheme
);

// GET /api/themes/banner/manage (Render the manage banner HTML page) [ADMIN]
router.get("/banner/manage", requireAdminAuth, themeController.renderManageBannerPage);

// GET /api/themes/banner (Get active featured banner JSON) [PUBLIC / APP]
router.get("/banner", themeController.getActiveBanner);

// POST /api/themes/banner/update (Update active featured banner) [ADMIN]
router.post(
  "/banner/update",
  requireAdminAuth,
  upload.single("image"),
  themeController.updateBanner
);

// GET /api/themes/broadcast (Render the broadcast push notification HTML page) [ADMIN]
router.get("/broadcast", requireAdminAuth, themeController.renderBroadcastPage);

// POST /api/themes/broadcast (Broadcast notification for an existing theme) [ADMIN]
router.post("/broadcast", requireAdminAuth, upload.none(), themeController.broadcastExistingTheme);

// GET /api/themes (Get all active themes) [PUBLIC / APP]
router.get("/", themeController.getAllThemes);

// GET /api/themes/trending (Get trending themes) [PUBLIC / APP]
router.get("/trending", themeController.getTrendingThemes);

// GET /api/themes/:id (Get single theme details) [PUBLIC / APP]
router.get("/:id", themeController.getSingleTheme);

// PUT /api/themes/:id (Update theme, optionally replacing images) [ADMIN]
router.put(
  "/:id",
  requireAdminAuth,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "previews", maxCount: 4 },
  ]),
  themeController.updateTheme
);

// DELETE /api/themes/:id (Delete theme and assets) [ADMIN]
router.delete("/:id", requireAdminAuth, themeController.deleteTheme);

module.exports = router;

