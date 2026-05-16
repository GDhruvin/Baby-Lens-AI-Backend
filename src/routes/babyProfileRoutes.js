// src/routes/babyProfileRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const analyze = require("../controllers/babyProfile/analyze");
const list = require("../controllers/babyProfile/list");
const deleteProfile = require("../controllers/babyProfile/delete");
const { requireAuth } = require("../middlewares/authMiddleware");

// 1. Tell Multer to keep the file in RAM (Memory) instead of the Hard Drive
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Enforce 5MB limit to protect memory
});

// POST /api/baby-profiles/analyze
router.post("/analyze", requireAuth, upload.single("baby_image"), analyze);
router.get("/my-list", requireAuth, list);
router.delete("/:id", requireAuth, deleteProfile);

module.exports = router;
