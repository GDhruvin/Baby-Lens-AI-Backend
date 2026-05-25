// src/controllers/babyProfile/utils.js

const { GoogleGenAI } = require("@google/genai");
const admin = require("../../config/firebase");
const PRIVATE_IMAGE_SIGNED_URL_TTL_MINUTES = Number(
  process.env.PRIVATE_IMAGE_SIGNED_URL_TTL_MINUTES || 60,
);

const useRealGemini = process.env.USE_GEMINI_API === "true";
const vertexModel = process.env.VERTEX_MODEL || "gemini-2.5-flash";

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
9. For gender, you must output either "male" or "female". Do not use "neutral".

Example output:

{
  "age_range": "0-6 months infant",
  "gender": "male",
  "face_lock": "round baby face with soft cheeks and small chin",
  "skin_tone": "fair warm skin tone",
  "texture_lock": "smooth soft baby skin",
  "expression_lock": "calm neutral expression"
}
`;

const ai = useRealGemini
  ? new GoogleGenAI({
      vertexai: true,
      project: process.env.GCP_PROJECT_ID,
      location: process.env.GCP_LOCATION || "us-central1",
    })
  : null;

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
      `Image deleted from Firebase Storage: ${cloudFileName}`,
    );
  } catch (deleteError) {
    console.error(
      "Failed to delete image from Firebase Storage:",
      deleteError.message,
    );
  }
}

function buildFirebaseStorageObjectUrl(bucketName, cloudPath) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(cloudPath)}`;
}

async function signCloudPath(bucket, cloudPath) {
  const expiresAt = Date.now() + PRIVATE_IMAGE_SIGNED_URL_TTL_MINUTES * 60 * 1000;
  const [signedUrl] = await bucket.file(cloudPath).getSignedUrl({
    action: "read",
    expires: expiresAt,
  });
  return signedUrl;
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
    const signedUrl = await signCloudPath(bucket, cloudPath);

    return signedUrl || imageUrl;
  } catch (error) {
    console.warn("[BabyProfiles] Failed to normalize image URL:", error.message);
    return imageUrl;
  }
}

async function generateIdentityJson(file) {
  if (!ai) return null;
  
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

const mockIdentity = {
  age_range: "0-6 months infant",
  gender: "male",
  face_lock: "round baby face with soft cheeks and small chin",
  skin_tone: "fair warm skin tone",
  texture_lock: "smooth soft baby skin",
  expression_lock: "calm neutral expression",
};

module.exports = {
  useRealGemini,
  vertexModel,
  safeParseJson,
  validateBabyFaceDetected,
  deleteUploadedImage,
  buildFirebaseStorageObjectUrl,
  signCloudPath,
  toSignedStorageUrl,
  generateIdentityJson,
  mockIdentity
};
