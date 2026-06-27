const express = require("express");
const router = express.Router();
const generationController = require("../controllers/generation.controller");
const { requireAuth } = require("../middlewares/auth.middleware");

// POST /api/generations/create (Triggers Vertex AI photo generation)
router.post("/create", requireAuth, generationController.create);

// GET /api/generations/uploaded-images (Basic flat list of outputs)
router.get("/uploaded-images", requireAuth, generationController.list);

// GET /api/generations/my-photos (Photoshoot gallery with sorting and filtering)
router.get("/my-photos", requireAuth, generationController.myPhotos);

// DELETE /api/generations/:id (Deletes photoshoot photo and cloud assets)
router.delete("/:id", requireAuth, generationController.deleteGeneration);

// GET /api/generations/photo/:id (Dynamically serves watermarked or pristine photos)
router.get("/photo/:id", requireAuth, generationController.photo);

module.exports = router;
