// src/routes/babyProfileRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { uploadAndAnalyze } = require("../controllers/babyProfileController");
const { requireAuth } = require("../middlewares/authMiddleware");

// 1. Ensure the 'uploads' folder exists on your laptop
const uploadDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 2. Tell Multer to save files to that folder
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    if (!req.user || !req.user.id) {
        return cb(new Error("Authentication required to upload image"));
    }
    cb(null, req.user.id + '_' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// POST /api/baby-profiles/analyze
router.post("/analyze", requireAuth, upload.single("baby_image"), uploadAndAnalyze);

module.exports = router;
