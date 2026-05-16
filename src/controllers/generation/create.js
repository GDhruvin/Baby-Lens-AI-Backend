// src/controllers/generation/create.js

const { GoogleGenAI } = require("@google/genai");
const admin = require("../../config/firebase");
const BabyProfile = require("../../models/BabyProfile");
const Theme = require("../../models/Theme");
const Generation = require("../../models/Generation");
const {
  toSignedStorageUrl,
  hasInvalidIdentity,
  buildFinalPrompt,
  extractGeneratedImages,
  uploadGeneratedImages
} = require("./utils");

const useRealGemini = process.env.USE_GEMINI_API === "true";
const imageModel =
  process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const imageLocation =
  process.env.GCP_IMAGE_LOCATION || process.env.GCP_LOCATION || "global";

const ai = useRealGemini
  ? new GoogleGenAI({
      vertexai: true,
      project: process.env.GCP_PROJECT_ID,
      location: imageLocation,
    })
  : null;

async function generateImages(
  prompt,
  referenceImageBase64,
  referenceMimeType,
) {
  if (!ai) return null;
  
  return ai.models.generateContent({
    model: imageModel,
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: referenceImageBase64,
              mimeType: referenceMimeType,
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ["IMAGE", "TEXT"],
      imageConfig: {
        aspectRatio: "4:5",
      },
    },
  });
}

module.exports = async (req, res) => {
  try {
    const userId = req.user.id;
    const payload = req.body?.data && typeof req.body.data === "object"
      ? req.body.data
      : req.body;
    const { profile_id, theme_id, payment_type = "free" } = payload || {};

    if (!profile_id || !theme_id) {
      return res.status(400).json({
        error_code: "MISSING_PROFILE_OR_THEME_ID",
        message: "profile_id and theme_id are required",
      });
    }

    const [profile, theme] = await Promise.all([
      BabyProfile.findById(profile_id),
      Theme.findById(theme_id),
    ]);

    if (!profile) {
      return res.status(404).json({
        error_code: "PROFILE_NOT_FOUND",
        message: "Baby profile not found",
      });
    }

    if (!theme || !theme.is_active) {
      return res.status(404).json({
        error_code: "THEME_NOT_FOUND_OR_INACTIVE",
        message: "Theme not found or inactive",
      });
    }

    if (String(profile.user_id) !== String(userId)) {
      return res.status(403).json({
        error_code: "PROFILE_NOT_OWNED_BY_USER",
        message: "You can generate only with your own baby profile",
      });
    }

    if (hasInvalidIdentity(profile.identity_json)) {
      return res.status(400).json({
        error_code: "INVALID_PROFILE_IDENTITY",
        message:
          "This profile has invalid face identity. Please re-upload a clear baby face image.",
      });
    }

    const finalPrompt = buildFinalPrompt(theme.prompt_template, profile.identity_json);
    const bucket = admin.storage().bucket();

    if (!useRealGemini) {
      const mockGeneration = await Generation.create({
        user_id: userId,
        baby_profile_id: profile._id,
        theme_selected: theme.label,
        output_image_urls: [],
        payment_type,
        status: "completed",
      });

      return res.status(200).json({
        message: "Mock mode enabled. Prompt prepared successfully.",
        generation_id: mockGeneration._id,
        prompt_used: finalPrompt,
        output_image_urls: [],
      });
    }

    const normalizedReferenceImageUrl = await toSignedStorageUrl(
      profile.reference_image_url,
    );
    const referenceImageResponse = await fetch(normalizedReferenceImageUrl);

    if (!referenceImageResponse.ok) {
      return res.status(400).json({
        error_code: "REFERENCE_IMAGE_UNREADABLE",
        message: "Failed to load reference baby image for generation",
        reference_image_status: referenceImageResponse.status,
        reference_image_url: normalizedReferenceImageUrl,
      });
    }

    const arrayBuffer = await referenceImageResponse.arrayBuffer();
    const referenceImageBase64 = Buffer.from(arrayBuffer).toString("base64");
    const referenceMimeType =
      referenceImageResponse.headers.get("content-type") || "image/jpeg";

    const generationResponse = await generateImages(
      finalPrompt,
      referenceImageBase64,
      referenceMimeType,
    );

    const generatedImages = extractGeneratedImages(generationResponse);

    if (!generatedImages.length) {
      return res.status(500).json({
        message: "Gemini returned no generated image data",
      });
    }

    const outputImageUrls = await uploadGeneratedImages(
      bucket,
      userId,
      generatedImages,
    );

    const savedGeneration = await Generation.create({
      user_id: userId,
      baby_profile_id: profile._id,
      theme_selected: theme.label,
      output_image_urls: outputImageUrls,
      payment_type: payment_type === "paid" ? "paid" : "free",
      status: "completed",
    });

    return res.status(200).json({
      message: "Image generated successfully",
      generation_id: savedGeneration._id,
      profile_id: profile._id,
      theme_id: theme._id,
      output_image_urls: outputImageUrls,
    });
  } catch (error) {
    console.error("Generate image error:", error);

    if (error?.status === 404) {
      return res.status(400).json({
        error_code: "IMAGE_MODEL_NOT_FOUND_OR_NO_ACCESS",
        message:
          "Configured image model is unavailable for this project/location. Use GEMINI_IMAGE_MODEL=gemini-2.5-flash-image and GCP_IMAGE_LOCATION=global, and ensure Vertex image model access is enabled.",
        model: imageModel,
        location: imageLocation,
        error: error.message,
      });
    }

    return res.status(500).json({
      message: "Failed to generate image",
      error: error.message,
    });
  }
};
