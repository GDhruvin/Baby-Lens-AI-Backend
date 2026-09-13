const { GoogleGenAI } = require("@google/genai");
const mongoose = require("mongoose");
const admin = require("../config/firebase");
const BabyProfile = require("../models/babyProfile.model");
const Theme = require("../models/theme.model");
const Generation = require("../models/generation.model");
const User = require("../models/user.model");
const Device = require("../models/device.model");
const { getFirebaseDownloadUrl, deleteFromFirebase } = require("../utils/storageUtils");
const notificationService = require("./notification.service");

// Env variables for Gemini / Vertex AI
const useRealGemini = process.env.USE_GEMINI_API === "true";
const imageModel = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const imageLocation = process.env.GCP_IMAGE_LOCATION || process.env.GCP_LOCATION || "global";
const MAX_GENERATION_ATTEMPTS = Number(process.env.GENERATION_MAX_ATTEMPTS || 6);
const EXTERNAL_REQUEST_TIMEOUT_MS = Number(process.env.GENERATION_EXTERNAL_REQUEST_TIMEOUT_MS || 60000);
const RETRY_DELAY_MIN_MS = Number(process.env.GENERATION_RETRY_DELAY_MIN_MS || 2000);
const RETRY_DELAY_MAX_MS = Number(process.env.GENERATION_RETRY_DELAY_MAX_MS || 5000);
const MAX_429_RETRIES = Number(process.env.GENERATION_MAX_429_RETRIES || 1);

const ai = useRealGemini
  ? new GoogleGenAI({
      vertexai: true,
      project: process.env.GCP_PROJECT_ID,
      location: imageLocation,
    })
  : null;

// ==================================================
// PRIVATE HELPER FUNCTIONS
// ==================================================

function hasInvalidIdentity(identityJson) {
  const values = Object.values(identityJson || {}).map((value) =>
    String(value).toLowerCase().trim()
  );

  const invalidKeywords = [
    "no baby face detected",
    "no face detected",
    "face not detected",
    "no baby detected",
    "unable to detect baby face",
    "cannot detect face",
    "no visible face",
  ];

  return values.some((value) =>
    invalidKeywords.some((keyword) => value.includes(keyword))
  );
}

function buildFinalPrompt(themePromptTemplate, identityJson) {
  const identityBlock = JSON.stringify(identityJson, null, 2);
  let finalPrompt = themePromptTemplate || "";

  // 1. Analyze Age & Posture Category from identityJson
  const ageText = String(identityJson?.age_range || identityJson?.age_group || identityJson?.age || "").toLowerCase();
  const genderText = String(identityJson?.gender || "").toLowerCase();

  // Determine if baby is a Younger Infant (< 6m) vs Older Sitter (>= 6m)
  const isInfant =
    ageText.includes("0-6") ||
    ageText.includes("0-5") ||
    ageText.includes("0-4") ||
    ageText.includes("0-3") ||
    ageText.includes("infant") ||
    ageText.includes("newborn") ||
    (ageText.includes("month") && !ageText.includes("12") && !ageText.includes("18") && !ageText.includes("24")) ||
    ageText.includes("lying");

  let postureInstruction = "";
  if (isInfant) {
    postureInstruction = `
AGE & POSTURE ADAPTATION (INFANT / < 6 MONTHS):
- The baby is a young infant (under 6 months old) who lies down on their back or tummy.
- CRITICAL POSTURE RULE: DO NOT force the baby into a sitting erect or standing posture.
- The photoshoot pose MUST be a natural, comfortable lying, resting, or sleeping pose on a soft plush cushion, velvet rug, flower bed, or cradled in a basket/swing.
- Use a top-down flat-lay or 45-degree overhead studio camera angle.
- Place all theme props softly beside or around the baby rather than forcing the baby to grip them.`;
  } else {
    postureInstruction = `
AGE & POSTURE ADAPTATION (TODDLER / SITTER >= 6 MONTHS):
- The baby is an older infant or toddler (6+ months old) capable of sitting upright independently.
- POSTURE RULE: The baby should be sitting erect or resting comfortably upright on a floor carpet, low stool, or chair.
- Use an eye-level studio camera angle.
- The baby can actively hold, touch, or interact with the theme props.`;
  }

  if (genderText === "male" || genderText === "boy") {
    postureInstruction += `\n- GENDER STYLING: Male baby traditional attire and accessories.`;
  } else if (genderText === "female" || genderText === "girl") {
    postureInstruction += `\n- GENDER STYLING: Female baby traditional attire and accessories (e.g., floral crown/headband, lehenga/dress accents).`;
  }

  if (finalPrompt.includes("{{identity_json}}")) {
    finalPrompt = finalPrompt.replace("{{identity_json}}", `${identityBlock}\n\n${postureInstruction}`);
  } else {
    finalPrompt = `${finalPrompt}

${postureInstruction}

Identity lock to preserve (must follow strictly):
${identityBlock}

Hard rules:
- Preserve the same baby facial identity from the reference image.
- Do not change age appearance, face shape, skin tone, skin texture, or expression.
- Keep output photorealistic and natural.`;
  }

  return finalPrompt;
}

function extractGeneratedImages(response) {
  if (Array.isArray(response?.generatedImages)) {
    return response.generatedImages
      .filter((item) => item?.image?.imageBytes)
      .map((item, index) => ({
        index,
        data: item.image.imageBytes,
        mimeType: item.image.mimeType || "image/png",
      }));
  }

  const parts =
    response?.candidates?.[0]?.content?.parts ||
    response?.output?.[0]?.content?.parts ||
    [];

  return parts
    .filter((part) => part.inlineData?.data)
    .map((part, index) => ({
      index,
      data: part.inlineData.data,
      mimeType: part.inlineData.mimeType || "image/png",
    }));
}

async function uploadGeneratedImages(bucket, userId, generatedImages) {
  const uploadedImages = [];

  for (let i = 0; i < generatedImages.length; i += 1) {
    const image = generatedImages[i];
    const extension = image.mimeType.includes("jpeg") ? "jpg" : "png";
    const cloudFileName = `generated_outputs/${userId}/${Date.now()}_${i}_${Math.random()
      .toString(36)
      .slice(2, 8)}.${extension}`;
    const fileRef = bucket.file(cloudFileName);

    await fileRef.save(Buffer.from(image.data, "base64"), {
      metadata: {
        contentType: image.mimeType,
      },
    });

    const downloadUrl = await getFirebaseDownloadUrl(cloudFileName);

    uploadedImages.push({
      downloadUrl,
      cloudPath: cloudFileName,
    });
  }

  return uploadedImages;
}

async function generateImages(prompt, referenceImageBase64, referenceMimeType) {
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
      responseModalalities: ["IMAGE", "TEXT"],
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

async function collectTargetGeneratedImage(prompt, referenceImageBase64, referenceMimeType) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const getRetryDelayMs = () => {
    const min = Math.max(0, RETRY_DELAY_MIN_MS);
    const max = Math.max(min, RETRY_DELAY_MAX_MS);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  let generatedImage = null;
  let attempts = 0;
  let quotaRetryCount = 0;

  while (!generatedImage && attempts < MAX_GENERATION_ATTEMPTS) {
    attempts += 1;
    try {
      const generationResponse = await generateImages(
        prompt,
        referenceImageBase64,
        referenceMimeType
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

    const hasMoreAttempts = !generatedImage && attempts < MAX_GENERATION_ATTEMPTS;
    if (hasMoreAttempts) {
      await sleep(getRetryDelayMs());
    }
  }

  return generatedImage;
}

function toObjectIdOrNull(value) {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(value);
}

// ==================================================
// PUBLIC SERVICE API
// ==================================================

/**
 * Handle business logic for creating a new baby photoshoot image
 */
/**
 * Helper function to handle atomic database writes for a completed generation.
 * Uses Mongoose transactions with a resilient fallback for standalone MongoDB deployments (e.g. local dev).
 */
async function saveGenerationAndCredits({
  userId,
  profileId,
  themeId,
  themeLabel,
  outputImageUrl,
  paymentType,
  isUnlocked,
}) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // 1. Create the Generation record
    const [savedGeneration] = await Generation.create([{
      user_id: userId,
      baby_profile_id: profileId,
      theme_id: themeId,
      theme_selected: themeLabel,
      output_image_url: outputImageUrl,
      payment_type: paymentType,
      is_unlocked: isUnlocked,
      status: "completed",
    }], { session });

    // 2. Update user credits
    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new Error("User not found during transaction write");
    }

    if (paymentType === "paid") {
      user.paid_credits = Math.max(0, user.paid_credits - 1);
    } else {
      user.free_generations_used = 1;
    }
    await user.save({ session });

    // 3. Increment theme generation count
    await Theme.findByIdAndUpdate(
      themeId,
      { $inc: { generation_count: 1 } },
      { session }
    );

    await session.commitTransaction();
    return savedGeneration;
  } catch (error) {
    await session.abortTransaction();

    // Check if error is due to transactions not being supported by standalone MongoDB
    const isTransactionNotSupported = 
      error.message.includes("transaction") || 
      error.message.includes("replica set") || 
      error.code === 20 || 
      error.codeName === "TransactionSystemFailed" ||
      String(error.message).toLowerCase().includes("transaction");

    if (isTransactionNotSupported) {
      console.warn("⚠️ Transactions not supported by this MongoDB deployment. Falling back to non-transactional writes.");
      
      // Fallback: Perform atomic-ish writes without Mongoose session
      const savedGeneration = await Generation.create({
        user_id: userId,
        baby_profile_id: profileId,
        theme_id: themeId,
        theme_selected: themeLabel,
        output_image_url: outputImageUrl,
        payment_type: paymentType,
        is_unlocked: isUnlocked,
        status: "completed",
      });

      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found during fallback write");
      }

      if (paymentType === "paid") {
        user.paid_credits = Math.max(0, user.paid_credits - 1);
      } else {
        user.free_generations_used = 1;
      }
      await user.save();

      await Theme.findByIdAndUpdate(themeId, { $inc: { generation_count: 1 } });

      return savedGeneration;
    } else {
      throw error;
    }
  } finally {
    session.endSession();
  }
}

/**
 * Handle business logic for creating a new baby photoshoot image
 */
async function createGeneration({ userId, profile_id, theme_id }) {
  if (!profile_id || !theme_id) {
    const error = new Error("profile_id and theme_id are required");
    error.code = "MISSING_PROFILE_OR_THEME_ID";
    error.status = 400;
    throw error;
  }

  if (!mongoose.Types.ObjectId.isValid(profile_id) || !mongoose.Types.ObjectId.isValid(theme_id)) {
    const error = new Error("profile_id and theme_id must be valid ids");
    error.code = "INVALID_PROFILE_OR_THEME_ID";
    error.status = 400;
    throw error;
  }

  const [profile, theme] = await Promise.all([
    BabyProfile.findById(profile_id),
    Theme.findById(theme_id),
  ]);

  if (!profile) {
    const error = new Error("Baby profile not found");
    error.code = "PROFILE_NOT_FOUND";
    error.status = 404;
    throw error;
  }

  if (!theme || !theme.is_active) {
    const error = new Error("Theme not found or inactive");
    error.code = "THEME_NOT_FOUND_OR_INACTIVE";
    error.status = 404;
    throw error;
  }

  if (String(profile.user_id) !== String(userId)) {
    const error = new Error("You can generate only with your own baby profile");
    error.code = "PROFILE_NOT_OWNED_BY_USER";
    error.status = 403;
    throw error;
  }

  if (hasInvalidIdentity(profile.identity_json)) {
    const error = new Error("This profile has invalid face identity. Please re-upload a clear baby face image.");
    error.code = "INVALID_PROFILE_IDENTITY";
    error.status = 400;
    throw error;
  }

  // Credit gating and anti-abuse checks
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error("User profile not found in database");
    error.code = "USER_NOT_FOUND";
    error.status = 404;
    throw error;
  }

  let resolvedPaymentType = "free";
  let isUnlocked = false;

  if (user.paid_credits > 0) {
    resolvedPaymentType = "paid";
    isUnlocked = true;
  } else {
    // Check if user has already claimed their free photoshoot
    if (user.free_generations_used > 0) {
      const error = new Error("You have used your free photoshoot. Please purchase a photoshoot pack to continue.");
      error.code = "INSUFFICIENT_CREDITS";
      error.status = 402;
      throw error;
    }

    // Anti-abuse: Check if any user linked to the same physical device has already claimed the free photoshoot
    const linkedDevices = await Device.find({ linked_users: userId });
    if (linkedDevices && linkedDevices.length > 0) {
      const allLinkedUserIds = [];
      linkedDevices.forEach((d) => {
        if (d.linked_users) {
          d.linked_users.forEach((uid) => {
            if (String(uid) !== String(userId)) {
              allLinkedUserIds.push(uid);
            }
          });
        }
      });

      if (allLinkedUserIds.length > 0) {
        const abuseFound = await User.exists({
          _id: { $in: allLinkedUserIds },
          free_generations_used: { $gt: 0 },
        });

        if (abuseFound) {
          // Flag current user's free trial as consumed to prevent bypass
          user.free_generations_used = 1;
          await user.save();

          const error = new Error("A free photoshoot has already been claimed on this device. Please purchase a photoshoot pack.");
          error.code = "DEVICE_FREE_TRIAL_LIMIT_EXCEEDED";
          error.status = 403;
          throw error;
        }
      }
    }

    resolvedPaymentType = "free";
    isUnlocked = false;
  }

  const finalPrompt = buildFinalPrompt(theme.prompt_template, profile.identity_json);
  const bucket = admin.storage().bucket();

  // Mock Generation mode (Instant transactional save)
  if (!useRealGemini) {
    const mockGeneration = await saveGenerationAndCredits({
      userId,
      profileId: profile._id,
      themeId: theme._id,
      themeLabel: theme.label,
      outputImageUrl: null,
      paymentType: resolvedPaymentType,
      isUnlocked,
    });

    // Fetch updated user credits for response
    const updatedUser = await User.findById(userId);

    return {
      isMock: true,
      generation_id: mockGeneration._id,
      prompt_used: finalPrompt,
      output_image_url: null,
      user_credits: {
        free_generations_used: updatedUser.free_generations_used,
        paid_credits: updatedUser.paid_credits,
      },
    };
  }

  // Real Generation Mode (External API calls occur outside transaction)
  const normalizedReferenceImageUrl = await getFirebaseDownloadUrl(profile.reference_image_url);

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
    const error = new Error("Could not read baby profile image from storage");
    error.code = "REFERENCE_IMAGE_UNREADABLE";
    error.status = 400;
    error.details = {
      reference_image_status: referenceImageResponse ? referenceImageResponse.status : "Fetch Failed",
      reference_image_url: normalizedReferenceImageUrl,
    };
    throw error;
  }

  const arrayBuffer = await referenceImageResponse.arrayBuffer();
  const referenceImageBase64 = Buffer.from(arrayBuffer).toString("base64");
  const referenceMimeType = referenceImageResponse.headers.get("content-type") || "image/jpeg";

  const generatedImage = await collectTargetGeneratedImage(
    finalPrompt,
    referenceImageBase64,
    referenceMimeType
  );

  if (!generatedImage) {
    throw new Error("Gemini did not return an image");
  }

  const uploadedImages = await uploadGeneratedImages(bucket, userId, [generatedImage]);
  const outputImageUrl = uploadedImages[0]?.downloadUrl || null;
  const outputImageCloudPath = uploadedImages[0]?.cloudPath || null;

  // Execute database writes inside a transaction
  const savedGeneration = await saveGenerationAndCredits({
    userId,
    profileId: profile._id,
    themeId: theme._id,
    themeLabel: theme.label,
    outputImageUrl: outputImageCloudPath,
    paymentType: resolvedPaymentType,
    isUnlocked,
  });

  // Fetch updated user credits for response
  const updatedUser = await User.findById(userId);

  const finalOutputUrl = outputImageUrl;

  // Dispatch background push notification (non-blocking)
  notificationService
    .notifyGenerationComplete({
      userId,
      generationId: savedGeneration._id,
      themeLabel: theme.label,
      imageUrl: finalOutputUrl,
    })
    .catch((pushErr) => {
      console.warn("[GenerationService] Push notification dispatch failed:", pushErr?.message);
    });

  return {
    isMock: false,
    generation_id: savedGeneration._id,
    profile_id: profile._id,
    theme_id: theme._id,
    output_image_url: finalOutputUrl,
    is_unlocked: savedGeneration.is_unlocked,
    user_credits: {
      free_generations_used: updatedUser.free_generations_used,
      paid_credits: updatedUser.paid_credits,
    },
  };
}

/**
 * Fetch flat list of all generated outputs for user
 */
async function listUploadedImages(userId) {
  const generations = await Generation.find({
    user_id: userId,
    output_image_url: { $exists: true, $ne: null },
  })
    .sort({ created_at: -1 })
    .select("_id baby_profile_id theme_selected output_image_url payment_type status created_at updated_at")
    .lean();

  const images = await Promise.all(
    generations.map(async (generation) => {
      const resolvedOutputUrl = generation.output_image_url
        ? await getFirebaseDownloadUrl(generation.output_image_url)
        : null;

      generation.output_image_url = resolvedOutputUrl;

      return {
        generation_id: generation._id,
        baby_profile_id: generation.baby_profile_id,
        theme_selected: generation.theme_selected,
        image_url: resolvedOutputUrl,
        payment_type: generation.payment_type,
        is_unlocked: generation.is_unlocked,
        status: generation.status,
        created_at: generation.created_at,
        updated_at: generation.updated_at,
      };
    })
  );

  return {
    generations,
    images,
  };
}

/**
 * Fetch user photo gallery with filtering, pagination and sorting
 */
async function myPhotos({ userId, queryParams }) {
  const {
    profile_id,
    theme_id,
    status,
    payment_type,
    date_from,
    date_to,
    page,
    limit,
    sort_by = "created_at",
    sort_order = "desc",
    count,
  } = queryParams;

  const filters = {
    user_id: toObjectIdOrNull(userId),
    output_image_url: { $exists: true, $ne: null },
  };

  const profileObjectId = toObjectIdOrNull(profile_id);
  if (profile_id && !profileObjectId) {
    const error = new Error("profile_id is invalid");
    error.code = "INVALID_PROFILE_ID";
    error.status = 400;
    throw error;
  }
  if (profileObjectId) filters.baby_profile_id = profileObjectId;

  const themeObjectId = toObjectIdOrNull(theme_id);
  if (theme_id && !themeObjectId) {
    const error = new Error("theme_id is invalid");
    error.code = "INVALID_THEME_ID";
    error.status = 400;
    throw error;
  }
  if (themeObjectId) filters.theme_id = themeObjectId;

  if (status) filters.status = status;
  if (payment_type) filters.payment_type = payment_type;

  if (date_from || date_to) {
    filters.created_at = {};
    if (date_from) {
      const from = new Date(date_from);
      if (Number.isNaN(from.getTime())) {
        const error = new Error("date_from must be a valid date");
        error.code = "INVALID_DATE_FROM";
        error.status = 400;
        throw error;
      }
      filters.created_at.$gte = from;
    }
    if (date_to) {
      const to = new Date(date_to);
      if (Number.isNaN(to.getTime())) {
        const error = new Error("date_to must be a valid date");
        error.code = "INVALID_DATE_TO";
        error.status = 400;
        throw error;
      }
      filters.created_at.$lte = to;
    }
  }

  const allowedSortFields = ["created_at", "updated_at"];
  const finalSortBy = allowedSortFields.includes(sort_by) ? sort_by : "created_at";
  const finalSortOrder = String(sort_order).toLowerCase() === "asc" ? 1 : -1;

  const query = Generation.find(filters).sort({ [finalSortBy]: finalSortOrder });

  let parsedPage = null;
  let parsedLimit = null;

  if (count !== undefined) {
    const parsedCount = Math.max(1, Number(count) || 5);
    query.limit(parsedCount);
  } else if (page !== undefined || limit !== undefined) {
    parsedPage = Math.max(1, Number(page) || 1);
    parsedLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (parsedPage - 1) * parsedLimit;
    query.skip(skip).limit(parsedLimit);
  }

  const [total, generations] = await Promise.all([
    Generation.countDocuments(filters),
    query
      .populate("baby_profile_id", "_id reference_image_url identity_json created_at updated_at")
      .populate("theme_id", "_id label description image_url badge is_active category_id createdAt updatedAt")
      .lean(),
  ]);

  const photos = await Promise.all(
    generations.map(async (generation) => {
      let themeDetails = generation.theme_id || null;

      if (!themeDetails && generation.theme_selected) {
        themeDetails = await Theme.findOne({ label: generation.theme_selected })
          .select("_id label description image_url badge is_active category_id createdAt updatedAt")
          .lean();
      }

      if (themeDetails?.image_url) {
        themeDetails.image_url = await getFirebaseDownloadUrl(themeDetails.image_url);
      }

      const outputImageUrl = generation.output_image_url
        ? await getFirebaseDownloadUrl(generation.output_image_url)
        : null;

      const profileDetails = generation.baby_profile_id
        ? {
            _id: generation.baby_profile_id._id,
            reference_image_url: await getFirebaseDownloadUrl(
              generation.baby_profile_id.reference_image_url
            ),
            identity_json: generation.baby_profile_id.identity_json,
            created_at: generation.baby_profile_id.created_at,
            updated_at: generation.baby_profile_id.updated_at,
          }
        : null;

      return {
        generation_id: generation._id,
        output_image_url: outputImageUrl,
        payment_type: generation.payment_type,
        is_unlocked: generation.is_unlocked,
        status: generation.status,
        created_at: generation.created_at,
        updated_at: generation.updated_at,
        profile: profileDetails,
        theme: themeDetails,
      };
    })
  );

  return {
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      total,
      total_pages: parsedLimit ? Math.ceil(total / parsedLimit) : 1,
    },
    filters: {
      profile_id: profile_id || null,
      theme_id: theme_id || null,
      status: status || null,
      payment_type: payment_type || null,
      date_from: date_from || null,
      date_to: date_to || null,
      sort_by: finalSortBy,
      sort_order: finalSortOrder === 1 ? "asc" : "desc",
    },
    photos,
  };
}

/**
 * Delete output photoshoot record and cleanup storage asset
 */
async function deleteGeneration({ userId, generationId }) {
  const generation = await Generation.findById(generationId);

  if (!generation) {
    const error = new Error("Generation not found");
    error.status = 404;
    throw error;
  }

  if (String(generation.user_id) !== String(userId)) {
    const error = new Error("You do not have permission to delete this generation");
    error.status = 403;
    throw error;
  }

  // Delete from Firebase Storage if URL/path exists
  if (generation.output_image_url) {
    await deleteFromFirebase(generation.output_image_url);
  }

  await Generation.findByIdAndDelete(generationId);
  return true;
}

module.exports = {
  createGeneration,
  listUploadedImages,
  myPhotos,
  deleteGeneration,
};
