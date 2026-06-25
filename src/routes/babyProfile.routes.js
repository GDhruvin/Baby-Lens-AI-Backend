const express = require("express");
const router = express.Router();
const multer = require("multer");
const babyProfileController = require("../controllers/babyProfile.controller");
const { requireAuth } = require("../middlewares/auth.middleware");

// Multer memory storage configuration (keeps file in RAM, 5MB limit)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// POST /api/baby-profiles/analyze
router.post("/analyze", requireAuth, upload.single("baby_image"), babyProfileController.analyze);

// GET /api/baby-profiles/my-list
router.get("/my-list", requireAuth, babyProfileController.list);

// PATCH /api/baby-profiles/:id
router.patch("/:id", requireAuth, babyProfileController.update);

// DELETE /api/baby-profiles/:id
router.delete("/:id", requireAuth, babyProfileController.deleteProfile);

module.exports = router;
