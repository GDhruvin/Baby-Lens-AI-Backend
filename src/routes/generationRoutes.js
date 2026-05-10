const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middlewares/authMiddleware");
const {
  generateFromThemeAndProfile,
  listUploadedImagesForUser,
} = require("../controllers/generationController");

router.post("/create", requireAuth, generateFromThemeAndProfile);
router.get("/uploaded-images", requireAuth, listUploadedImagesForUser);

module.exports = router;
