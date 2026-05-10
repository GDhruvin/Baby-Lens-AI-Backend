// src/controllers/babyProfileController.js

const { GoogleGenAI } = require("@google/genai");
const admin = require("../config/firebase");
const BabyProfile = require("../models/BabyProfile");

// ======================================================
// CONFIG
// ======================================================

const useRealGemini = process.env.USE_GEMINI_API === "true";

const vertexModel = process.env.VERTEX_MODEL || "gemini-2.5-flash";


// ======================================================
// MOCK RESPONSE (when USE_GEMINI_API=false)
// ======================================================

const mockIdentity = {
  age_range: "0-6 months infant",
  gender: "neutral",
  face_lock: "round baby face with soft cheeks and small chin",
  skin_tone: "fair warm skin tone",
  texture_lock: "smooth soft baby skin",
  expression_lock: "calm neutral expression",
};

// ======================================================
// PROMPT
// ======================================================

const systemPrompt = `
You are an expert newborn facial identity extraction specialist.

Analyze the attached baby image and extract ONLY the identity-critical facial attributes required for preserving the same baby's face in downstream AI photoshoot generation.

Focus on:
- age appearance
- facial structure
- face shape
- cheeks / jaw softness
- skin tone
- skin texture
- expression
- baby-specific facial identity details

Return ONLY valid raw JSON.

Use EXACT keys:

{
  "age_range": "",
  "gender": "",
  "face_lock": "",
  "skin_tone": "",
  "texture_lock": "",
  "expression_lock": ""
}

Rules:
1. No markdown
2. No explanation
3. No backticks
4. No boolean values like true/false
5. Use descriptive natural text
6. Preserve identity accuracy over simplification
7. Focus only on the baby face
8. Ignore background, clothes, accessories, toys, bedsheets, lighting

Example output:

{
  "age_range": "0-6 months infant",
  "gender": "neutral",
  "face_lock": "round baby face with soft cheeks and small chin",
  "skin_tone": "fair warm skin tone",
  "texture_lock": "smooth soft baby skin",
  "expression_lock": "calm neutral expression"
}
`;

// ======================================================
// VERTEX AI INIT (ADC MODE)
// ======================================================

const ai = useRealGemini
  ? new GoogleGenAI({
      vertexai: true,
      project: process.env.GCP_PROJECT_ID,
      location: process.env.GCP_LOCATION || "us-central1",
    })
  : null;

// ======================================================
// SAFE JSON PARSER
// ======================================================

function safeParseJson(rawText) {
  try {
    return JSON.parse(rawText);
  } catch (error) {
    console.error("JSON Parse Failed:", rawText);
    throw new Error("Invalid JSON response received from Vertex AI");
  }
}

function validateBabyFaceDetected(identityJson) {
  const values = Object.values(identityJson || {}).map((value) =>
    String(value).toLowerCase().trim(),
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

  const isInvalid = values.some((value) =>
    invalidKeywords.some((keyword) => value.includes(keyword)),
  );

  if (isInvalid) {
    const error = new Error(
      "No clear baby face detected in the uploaded image.",
    );
    error.code = "NO_BABY_FACE_DETECTED";
    throw error;
  }

  return true;
}

async function deleteUploadedImage(bucket, cloudFileName) {
  try {
    await bucket.file(cloudFileName).delete();
    console.log(
      `Invalid image deleted from Firebase Storage: ${cloudFileName}`,
    );
  } catch (deleteError) {
    console.error(
      "Failed to delete invalid image from Firebase Storage:",
      deleteError.message,
    );
  }
}

async function toSignedStorageUrl(imageUrl) {
  if (!imageUrl) return imageUrl;

  try {
    const parsed = new URL(imageUrl);
    const isFirebaseStorageHost =
      parsed.hostname === "firebasestorage.googleapis.com";
    const hasToken = parsed.searchParams.has("token");
    const isAlreadySigned = parsed.searchParams.has("X-Goog-Signature");

    if (!isFirebaseStorageHost || hasToken || isAlreadySigned) {
      return imageUrl;
    }

    const encodedPath = parsed.pathname.split("/o/")[1];
    if (!encodedPath) return imageUrl;

    const cloudPath = decodeURIComponent(encodedPath.split("?")[0]);
    const bucket = admin.storage().bucket();
    const [signedUrl] = await bucket.file(cloudPath).getSignedUrl({
      action: "read",
      expires: "01-01-2036",
    });

    return signedUrl || imageUrl;
  } catch (error) {
    console.warn("[BabyProfiles] Failed to normalize image URL:", error.message);
    return imageUrl;
  }
}

// ======================================================
// GEMINI GENERATION
// ======================================================

async function generateIdentityJson(file) {
  return ai.models.generateContent({
    model: vertexModel,
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              systemPrompt + "\nFocus only on facial identity extraction.",
          },
          {
            inlineData: {
              data: file.buffer.toString("base64"),
              mimeType: file.mimetype,
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      temperature: 0.2,
      topP: 0.8,
    },
  });
}

// ======================================================
// MAIN CONTROLLER
// ======================================================

exports.uploadAndAnalyze = async (req, res) => {
  try {
    const userId = req.user.id;
    const file = req.file;

    // ==================================================
    // VALIDATION
    // ==================================================

    if (!file) {
      return res.status(400).json({
        message: "No image provided",
      });
    }

    console.log("1. Uploading baby image to Firebase Storage...");

    // ==================================================
    // FIREBASE STORAGE UPLOAD
    // ==================================================

    const bucket = admin.storage().bucket();

    const safeFilename = file.originalname.replace(/[^a-zA-Z0-9.]/g, "_");

    const cloudFileName = `baby_profiles/${userId}/${Date.now()}_${safeFilename}`;

    const fileRef = bucket.file(cloudFileName);

    await fileRef.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
      },
    });

    const [imageUrl] = await fileRef.getSignedUrl({
      action: "read",
      expires: "01-01-2036",
    });

    console.log("Image uploaded:", imageUrl);

    // ==================================================
    // GEMINI ANALYSIS
    // ==================================================

    let identityJson;

    if (!useRealGemini) {
      console.log("2. MOCK MODE ENABLED → Using mock response");

      identityJson = mockIdentity;
    } else {
      console.log(
        `2. REAL MODE → Vertex AI analyzing using model: ${vertexModel}`,
      );

      try {
        const response = await generateIdentityJson(file);

        console.log("Raw Vertex Response:", response.text);

        identityJson = safeParseJson(response.text);

        validateBabyFaceDetected(identityJson);
      } catch (aiError) {
        console.error("Vertex AI Error:", aiError);

        if (aiError.status === 401) {
          return res.status(401).json({
            message:
              "Authentication failed. Please verify ADC login and project access.",
            error: aiError.message,
          });
        }

        if (aiError.status === 403) {
          return res.status(403).json({
            message:
              "Permission denied. Ensure Vertex AI API is enabled and IAM roles are correct.",
            error: aiError.message,
          });
        }

        if (aiError.message && aiError.message.includes("Quota")) {
          return res.status(429).json({
            message:
              "Vertex AI quota exceeded. Please check billing/quota usage.",
            error: aiError.message,
          });
        }

        if (aiError.code === "NO_BABY_FACE_DETECTED") {
          // Remove invalid uploaded image from Firebase Storage
          await deleteUploadedImage(bucket, cloudFileName);

          return res.status(400).json({
            message:
              "No clear baby face detected. Please upload an image where the baby's face is clearly visible.",
            error: aiError.message,
          });
        }

        throw aiError;
      }
    }

    // ==================================================
    // SAVE TO DATABASE
    // ==================================================

    console.log("3. Saving Baby Profile to MongoDB...");

    const newProfile = new BabyProfile({
      user_id: userId,
      reference_image_url: imageUrl,
      identity_json: identityJson,
    });

    await newProfile.save();

    console.log("Baby profile saved successfully.");

    // ==================================================
    // SUCCESS RESPONSE
    // ==================================================

    return res.status(200).json({
      message: useRealGemini
        ? "Baby face analyzed successfully via Vertex AI"
        : "Baby face analyzed successfully (Mock Mode)",

      profile_id: newProfile._id,
      image_url: imageUrl,
      analysis: identityJson,
    });
  } catch (error) {
    console.error("Upload/Analyze Error:", error);

    return res.status(500).json({
      message:
        "Failed to analyze image. Please ensure the baby face is clearly visible.",
      error: error.message,
    });
  }
};

exports.listMyBabyProfiles = async (req, res) => {
  try {
    const userId = req.user.id;

    const profiles = await BabyProfile.find({ user_id: userId })
      .sort({ created_at: -1 })
      .select("_id user_id reference_image_url identity_json created_at updated_at")
      .lean();

    const profilesWithResolvedUrls = await Promise.all(
      profiles.map(async (profile) => ({
        ...profile,
        reference_image_url: await toSignedStorageUrl(profile.reference_image_url),
      })),
    );

    return res.status(200).json({
      message: "Baby profiles fetched successfully",
      total_profiles: profilesWithResolvedUrls.length,
      profiles: profilesWithResolvedUrls,
    });
  } catch (error) {
    console.error("List baby profiles error:", error);

    return res.status(500).json({
      message: "Failed to fetch baby profiles",
      error: error.message,
    });
  }
};
