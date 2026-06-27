const generationService = require("../services/generation.service");
const admin = require("../config/firebase");
const Generation = require("../models/generation.model");
const User = require("../models/user.model");
const { applyWatermark } = require("../services/watermark.service");

/**
 * Trigger AI photoshoot image generation
 */
async function create(req, res, next) {
  try {
    const userId = req.user.id;
    const payload = req.body?.data && typeof req.body.data === "object" ? req.body.data : req.body;
    const { profile_id, theme_id } = payload || {};

    const result = await generationService.createGeneration({ userId, profile_id, theme_id });

    if (result.isMock) {
      return res.status(200).json({
        message: "Mock mode enabled. Prompt prepared successfully.",
        generation_id: result.generation_id,
        prompt_used: result.prompt_used,
        output_image_url: null,
        user_credits: result.user_credits,
      });
    }

    return res.status(200).json({
      message: "Image generated successfully",
      generation_id: result.generation_id,
      profile_id: result.profile_id,
      theme_id: result.theme_id,
      output_image_url: result.output_image_url,
      user_credits: result.user_credits,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Fetch basic list of uploaded outputs
 */
async function list(req, res, next) {
  try {
    const userId = req.user.id;
    const result = await generationService.listUploadedImages(userId);

    return res.status(200).json({
      message: "Uploaded images fetched successfully",
      total_images: result.images.length,
      total_generations: result.generations.length,
      generations: result.generations,
      images: result.images,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Fetch detailed user photoshoot photos with pagination, filtering and sorting
 */
async function myPhotos(req, res, next) {
  try {
    const userId = req.user.id;
    const result = await generationService.myPhotos({ userId, queryParams: req.query });

    return res.status(200).json({
      message: "My photos fetched successfully",
      pagination: result.pagination,
      filters: result.filters,
      photos: result.photos,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete a photoshoot generation
 */
async function deleteGeneration(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    await generationService.deleteGeneration({ userId, generationId: id });

    return res.status(200).json({
      message: "Generation deleted successfully",
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Dynamically serve photoshoot images.
 * Protected by requireAuth middleware.
 * If the photoshoot is locked, overlays a brand watermark on the fly before streaming.
 */
async function photo(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // 1. Fetch the generation record from MongoDB
    const generation = await Generation.findById(id);
    if (!generation) {
      return res.status(404).json({
        error_code: "GENERATION_NOT_FOUND",
        message: "Photoshoot not found",
      });
    }

    // 2. Verify ownership
    if (String(generation.user_id) !== String(userId)) {
      return res.status(403).json({
        error_code: "UNAUTHORIZED_ACCESS",
        message: "You do not have permission to access this photo",
      });
    }

    if (!generation.output_image_url) {
      return res.status(400).json({
        error_code: "IMAGE_NOT_GENERATED_YET",
        message: "This photoshoot does not have a generated output image",
      });
    }

    // 3. Download the original image from Firebase Storage into memory
    const bucket = admin.storage().bucket();
    const file = bucket.file(generation.output_image_url);
    const [exists] = await file.exists();

    if (!exists) {
      return res.status(404).json({
        error_code: "FILE_NOT_FOUND_IN_STORAGE",
        message: "Original image file could not be found in storage",
      });
    }

    console.log(`[photoController] Downloading original image from Firebase: ${generation.output_image_url}`);
    const [originalBuffer] = await file.download();

    // 4. Serve the image based on unlocked status
    if (generation.is_unlocked === true) {
      console.log(`[photoController] Serving pristine high-res photo for unlocked generation ${id}`);
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=86400"); // Cache pristine images for 24 hours
      return res.send(originalBuffer);
    } else {
      console.log(`[photoController] Applying watermark on the fly for locked generation ${id}`);
      const watermarkedBuffer = await applyWatermark(originalBuffer);
      
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private"); // Do not cache locked previews
      return res.send(watermarkedBuffer);
    }
  } catch (error) {
    next(error);
  }
}

module.exports = {
  create,
  list,
  myPhotos,
  deleteGeneration,
  photo,
};
