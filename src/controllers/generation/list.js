// src/controllers/generation/list.js

const Generation = require("../../models/Generation");

module.exports = async (req, res) => {
  try {
    const userId = req.user.id;

    const generations = await Generation.find({
      user_id: userId,
      output_image_urls: { $exists: true, $ne: [] },
    })
      .sort({ created_at: -1 })
      .select(
        "_id baby_profile_id theme_selected output_image_urls payment_type status created_at updated_at",
      )
      .lean();

    const images = generations.flatMap((generation) =>
      (generation.output_image_urls || []).map((imageUrl, index) => ({
        generation_id: generation._id,
        baby_profile_id: generation.baby_profile_id,
        theme_selected: generation.theme_selected,
        image_url: imageUrl,
        image_index: index,
        payment_type: generation.payment_type,
        status: generation.status,
        created_at: generation.created_at,
        updated_at: generation.updated_at,
      })),
    );

    return res.status(200).json({
      message: "Uploaded images fetched successfully",
      total_images: images.length,
      total_generations: generations.length,
      generations,
      images,
    });
  } catch (error) {
    console.error("List uploaded images error:", error);

    return res.status(500).json({
      message: "Failed to fetch uploaded images",
      error: error.message,
    });
  }
};
