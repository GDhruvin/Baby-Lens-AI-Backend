const { GoogleGenAI } = require("@google/genai");
const admin = require("../config/firebase");
const BabyProfile = require("../models/babyProfile.model");
const { 
  uploadBufferToFirebase, 
  deleteFromFirebase, 
  getFirebaseDownloadUrl 
} = require("../utils/storageUtils");

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

const mockIdentity = {
  age_range: "0-6 months infant",
  gender: "male",
  face_lock: "round baby face with soft cheeks and small chin",
  skin_tone: "fair warm skin tone",
  texture_lock: "smooth soft baby skin",
  expression_lock: "calm neutral expression",
};

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

  const isInvalid = values.some((value) =>
    invalidKeywords.some((keyword) => value.includes(keyword))
  );

  if (isInvalid) {
    const error = new Error("No clear baby face detected in the uploaded image.");
    error.code = "NO_BABY_FACE_DETECTED";
    error.status = 400;
    throw error;
  }

  return true;
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
            text: systemPrompt + "\nFocus only on facial identity extraction.",
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

/**
 * Upload, analyze, and save baby profile image
 */
async function analyzeBabyProfile({ userId, file }) {
  if (!file) {
    const error = new Error("No image provided");
    error.status = 400;
    throw error;
  }

  console.log("1. Uploading baby image to Firebase Storage...");
  const safeFilename = file.originalname.replace(/[^a-zA-Z0-9.]/g, "_");
  const cloudFileName = `baby_profiles/${userId}/${Date.now()}_${safeFilename}`;
  
  const imageUrl = await uploadBufferToFirebase(cloudFileName, file.buffer, file.mimetype);
  console.log("Image uploaded:", imageUrl);

  let identityJson;

  if (!useRealGemini) {
    console.log("2. MOCK MODE ENABLED → Using mock response");
    identityJson = mockIdentity;
  } else {
    console.log(`2. REAL MODE → Vertex AI analyzing using model: ${vertexModel}`);
    try {
      const response = await generateIdentityJson(file);
      console.log("Raw Vertex Response:", response.text);
      
      identityJson = safeParseJson(response.text);
      validateBabyFaceDetected(identityJson);
    } catch (aiError) {
      console.error("Vertex AI Error:", aiError);
      
      // If error is about baby face detection, clean up the uploaded image
      if (aiError.code === "NO_BABY_FACE_DETECTED") {
        await deleteFromFirebase(cloudFileName);
      }
      throw aiError;
    }
  }

  console.log("3. Saving Baby Profile to MongoDB...");
  const newProfile = new BabyProfile({
    user_id: userId,
    reference_image_url: cloudFileName,
    identity_json: identityJson,
  });

  await newProfile.save();
  console.log("Baby profile saved successfully.");

  return {
    profile_id: newProfile._id,
    image_url: imageUrl,
    analysis: identityJson,
    useRealGemini,
  };
}

/**
 * List all baby profiles for a user
 */
async function getBabyProfiles(userId) {
  const profiles = await BabyProfile.find({ user_id: userId })
    .sort({ created_at: -1 })
    .select("_id user_id reference_image_url identity_json created_at updated_at")
    .lean();

  return Promise.all(
    profiles.map(async (profile) => ({
      ...profile,
      reference_image_url: await getFirebaseDownloadUrl(profile.reference_image_url),
    }))
  );
}

/**
 * Delete a baby profile
 */
async function deleteBabyProfile({ userId, profileId }) {
  const profile = await BabyProfile.findById(profileId);

  if (!profile) {
    const error = new Error("Baby profile not found");
    error.status = 404;
    throw error;
  }

  if (String(profile.user_id) !== String(userId)) {
    const error = new Error("You do not have permission to delete this profile");
    error.status = 403;
    throw error;
  }

  // Delete from Firebase Storage if URL/path exists
  if (profile.reference_image_url) {
    await deleteFromFirebase(profile.reference_image_url);
  }

  await BabyProfile.findByIdAndDelete(profileId);
  return true;
}

/**
 * Update a baby profile
 */
async function updateBabyProfile({ userId, profileId, updateData }) {
  const profile = await BabyProfile.findOne({ _id: profileId, user_id: userId });
  
  if (!profile) {
    const error = new Error("Baby profile not found");
    error.status = 404;
    throw error;
  }

  let isModified = false;

  // Update identity_json properties selectively
  if (updateData.identity_json) {
    profile.identity_json = { ...profile.identity_json, ...updateData.identity_json };
    isModified = true;
  } else {
    const allowedIdentityFields = ["age_range", "gender", "face_lock", "skin_tone", "texture_lock", "expression_lock"];
    
    for (const key of Object.keys(updateData)) {
      if (allowedIdentityFields.includes(key)) {
        if (!profile.identity_json) profile.identity_json = {};
        profile.identity_json[key] = updateData[key];
        isModified = true;
      }
    }
  }

  if (isModified) {
    profile.markModified('identity_json');
    await profile.save();
  }

  const profileObj = profile.toObject();
  profileObj.reference_image_url = await getFirebaseDownloadUrl(profileObj.reference_image_url);

  return profileObj;
}

module.exports = {
  analyzeBabyProfile,
  getBabyProfiles,
  deleteBabyProfile,
  updateBabyProfile,
};
