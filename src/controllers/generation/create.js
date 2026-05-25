// src/controllers/generation/create.js

const { GoogleGenAI } = require("@google/genai");
const mongoose = require("mongoose");
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
const TARGET_OUTPUT_IMAGE_COUNT = 1;
const MAX_GENERATION_ATTEMPTS = Number(
  process.env.GENERATION_MAX_ATTEMPTS || 6,
);
const EXTERNAL_REQUEST_TIMEOUT_MS = Number(
  process.env.GENERATION_EXTERNAL_REQUEST_TIMEOUT_MS || 60000,
);
const RETRY_DELAY_MIN_MS = Number(
  process.env.GENERATION_RETRY_DELAY_MIN_MS || 2000,
);
const RETRY_DELAY_MAX_MS = Number(
  process.env.GENERATION_RETRY_DELAY_MAX_MS || 5000,
);
const MAX_429_RETRIES = Number(
  process.env.GENERATION_MAX_429_RETRIES || 1,
);

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

  const requestPromise = ai.models.generateContent({
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

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error("Gemini image generation timed out"));
    }, EXTERNAL_REQUEST_TIMEOUT_MS);
  });

  return Promise.race([requestPromise, timeoutPromise]);
}

async function collectTargetGeneratedImage(
  prompt,
  referenceImageBase64,
  referenceMimeType,
) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const getRetryDelayMs = () => {
    const min = Math.max(0, RETRY_DELAY_MIN_MS);
    const max = Math.max(min, RETRY_DELAY_MAX_MS);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  let generatedImage = null;
  let attempts = 0;
  let quotaRetryCount = 0;

  while (
    !generatedImage &&
    attempts < MAX_GENERATION_ATTEMPTS
  ) {
    attempts += 1;
    try {
      const generationResponse = await generateImages(
        prompt,
        referenceImageBase64,
        referenceMimeType,
      );
      const batch = extractGeneratedImages(generationResponse);

      if (batch.length) {
        generatedImage = batch[0];
      }
    } catch (error) {
      if (error?.status !== 429) {
        throw error;
      }

      quotaRetryCount += 1;
      if (quotaRetryCount > MAX_429_RETRIES) {
        throw error;
      }
    }

    const hasMoreAttempts =
      !generatedImage &&
      attempts < MAX_GENERATION_ATTEMPTS;
    if (hasMoreAttempts) {
      await sleep(getRetryDelayMs());
    }
  }

  return generatedImage;
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
    
    if (
      !mongoose.Types.ObjectId.isValid(profile_id) ||
      !mongoose.Types.ObjectId.isValid(theme_id)
    ) {
      return res.status(400).json({
        error_code: "INVALID_PROFILE_OR_THEME_ID",
        message: "profile_id and theme_id must be valid ids",
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
        output_image_url: null,
      });
    }

    const normalizedReferenceImageUrl = await toSignedStorageUrl(
      profile.reference_image_url,
    );
    const fetchController = new AbortController();
    const fetchTimeout = setTimeout(() => {
      fetchController.abort();
    }, EXTERNAL_REQUEST_TIMEOUT_MS);
    let referenceImageResponse;
    try {
      referenceImageResponse = await fetch(normalizedReferenceImageUrl, {
        signal: fetchController.signal,
      });
    } finally {
      clearTimeout(fetchTimeout);
    }

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

    const generatedImage = await collectTargetGeneratedImage(
      finalPrompt,
      referenceImageBase64,
      referenceMimeType,
    );

    if (!generatedImage) {
      return res.status(500).json({
        message: "Gemini did not return an image",
      });
    }

    const uploadedImages = await uploadGeneratedImages(
      bucket,
      userId,
      [generatedImage],
    );
    const outputImageUrl = uploadedImages[0]?.signedUrl || null;
    const outputImageStorageUrl = uploadedImages[0]?.storageObjectUrl || null;

    const savedGeneration = await Generation.create({
      user_id: userId,
      baby_profile_id: profile._id,
      theme_id: theme._id,
      theme_selected: theme.label,
      output_image_urls: outputImageUrl,
      payment_type: payment_type === "paid" ? "paid" : "free",
      status: "completed",
    });

    return res.status(200).json({
      message: "Image generated successfully",
      generation_id: savedGeneration._id,
      profile_id: profile._id,
      theme_id: theme._id,
      output_image_url: outputImageUrl,
    });
  } catch (error) {
    console.error("Generate image error:", error);

    if (error?.status === 429) {
      return res.status(429).json({
        error_code: "GENERATION_QUOTA_EXCEEDED",
        message:
          "Image generation quota exhausted. Please retry later.",
      });
    }

    if (error?.name === "AbortError") {
      return res.status(504).json({
        error_code: "REFERENCE_IMAGE_FETCH_TIMEOUT",
        message: "Reference image fetch timed out",
      });
    }

    if (String(error?.message || "").toLowerCase().includes("timed out")) {
      return res.status(504).json({
        error_code: "GENERATION_TIMEOUT",
        message: error.message,
      });
    }

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
