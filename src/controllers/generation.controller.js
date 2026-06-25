const generationService = require("../services/generation.service");

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

module.exports = {
  create,
  list,
  myPhotos,
  deleteGeneration,
};
