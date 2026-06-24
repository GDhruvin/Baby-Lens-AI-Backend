// src/controllers/generation/create.js

const { GoogleGenAI } = require("@google/genai");
const mongoose = require("mongoose");
const admin = require("../../config/firebase");
const BabyProfile = require("../../models/BabyProfile");
const Theme = require("../../models/Theme");
const Generation = require("../../models/Generation");
const { getFirebaseDownloadUrl } = require("../../utils/storageUtils");
const {
  hasInvalidIdentity,
  buildFinalPrompt,
  extractGeneratedImages,
  uploadGeneratedImages
} = require("./utils");

const User = require("../../models/User");
const Device = require("../../models/Device");

const useRealGemini = process.env.USE_GEMINI_API === "true";
const imageModel =
  process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const imageLocation =
  process.env.GCP_IMAGE_LOCATION || process.env.GCP_LOCATION || "global";
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
    const { profile_id, theme_id } = payload || {};

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

    // ==================================================
    // CREDIT GATING & DEVICE ANTI-ABUSE
    // ==================================================
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error_code: "USER_NOT_FOUND",
        message: "User profile not found in database",
      });
    }

    let resolvedPaymentType = "free";
    let isUnlocked = false;

    if (user.paid_credits > 0) {
      // Case A: User has paid credits, always consume paid credits first
      resolvedPaymentType = "paid";
      isUnlocked = true;
    } else {
      // Case B: User wants to claim free photoshoot
      // 1. Check if the user themselves has already claimed the free photoshoot
      if (user.free_generations_used > 0) {
        return res.status(402).json({
          error_code: "INSUFFICIENT_CREDITS",
          message: "You have used your free photoshoot. Please purchase a photoshoot pack to continue.",
        });
      }

      // 2. Anti-abuse: Check if any user account linked to the same physical device has already claimed the free photoshoot
      const linkedDevices = await Device.find({ linked_users: userId });
      if (linkedDevices && linkedDevices.length > 0) {
        const allLinkedUserIds = [];
        linkedDevices.forEach(d => {
          if (d.linked_users) {
            d.linked_users.forEach(uid => {
              if (String(uid) !== String(userId)) {
                allLinkedUserIds.push(uid);
              }
            });
          }
        });

        if (allLinkedUserIds.length > 0) {
          // Check if any of these users have free_generations_used > 0
          const abuseFound = await User.exists({
            _id: { $in: allLinkedUserIds },
            free_generations_used: { $gt: 0 }
          });

          if (abuseFound) {
            // Flag the current user's free trial as consumed to prevent future bypass attempts
            user.free_generations_used = 1;
            await user.save();

            return res.status(403).json({
              error_code: "DEVICE_FREE_TRIAL_LIMIT_EXCEEDED",
              message: "A free photoshoot has already been claimed on this device. Please purchase a photoshoot pack.",
            });
          }
        }
      }

      // If checks pass, this photoshoot is the free trial photoshoot
      resolvedPaymentType = "free";
      isUnlocked = false;
    }

    const finalPrompt = buildFinalPrompt(theme.prompt_template, profile.identity_json);
    const bucket = admin.storage().bucket();

    if (!useRealGemini) {
      const mockGeneration = await Generation.create({
        user_id: userId,
        baby_profile_id: profile._id,
        theme_selected: theme.label,
        output_image_url: null,
        payment_type: resolvedPaymentType,
        is_unlocked: isUnlocked,
        status: "completed",
      });

      // Update user credits
      if (resolvedPaymentType === "paid") {
        user.paid_credits = Math.max(0, user.paid_credits - 1);
      } else {
        user.free_generations_used = 1;
      }
      await user.save();

      // Increment theme generation count
      await Theme.findByIdAndUpdate(theme._id, { $inc: { generation_count: 1 } });

      return res.status(200).json({
        message: "Mock mode enabled. Prompt prepared successfully.",
        generation_id: mockGeneration._id,
        prompt_used: finalPrompt,
        output_image_url: null,
        user_credits: {
          free_generations_used: user.free_generations_used,
          paid_credits: user.paid_credits,
        },
      });
    }

    const normalizedReferenceImageUrl = await getFirebaseDownloadUrl(
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
    } catch (err) {
      console.warn("Failed to fetch reference image:", err.message);
    } finally {
      clearTimeout(fetchTimeout);
    }

    if (!referenceImageResponse || !referenceImageResponse.ok) {
      return res.status(400).json({
        error_code: "REFERENCE_IMAGE_UNREADABLE",
        message: "Could not read baby profile image from storage",
        reference_image_status: referenceImageResponse ? referenceImageResponse.status : "Fetch Failed",
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
    const outputImageUrl = uploadedImages[0]?.downloadUrl || null;
    const outputImageCloudPath = uploadedImages[0]?.cloudPath || null;

    const savedGeneration = await Generation.create({
      user_id: userId,
      baby_profile_id: profile._id,
      theme_id: theme._id,
      theme_selected: theme.label,
      output_image_url: outputImageCloudPath, // Store cloud path
      payment_type: resolvedPaymentType,
      is_unlocked: isUnlocked,
      status: "completed",
    });

    // Update user credits only on successful generation
    if (resolvedPaymentType === "paid") {
      user.paid_credits = Math.max(0, user.paid_credits - 1);
    } else {
      user.free_generations_used = 1;
    }
    await user.save();

    // Increment theme generation count
    await Theme.findByIdAndUpdate(theme._id, { $inc: { generation_count: 1 } });

    return res.status(200).json({
      message: "Image generated successfully",
      generation_id: savedGeneration._id,
      profile_id: profile._id,
      theme_id: theme._id,
      output_image_url: outputImageUrl,
      user_credits: {
        free_generations_used: user.free_generations_used,
        paid_credits: user.paid_credits,
      },
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
