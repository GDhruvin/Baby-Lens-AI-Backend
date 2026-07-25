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
You are an expert newborn and infant facial identity extraction specialist.

Analyze the attached image and extract ONLY the identity-critical facial attributes required for preserving a baby's face in downstream AI photoshoot generation.

CRITICAL VALIDATION RULES:
1. SINGLE BABY FACE ONLY: The image MUST feature a SINGLE baby/infant face as the main subject. If multiple faces or a group photo is detected, set "face_lock": "multiple faces detected".
2. BABY / INFANT ONLY: The subject MUST be a baby, infant, or toddler (0-3 years old). If the photo shows an adult, teenager, or older child, set "age_range": "not a baby - adult or older person detected".
3. CLEAR FACE REQUIRED: If no clear face is visible, set "face_lock": "no baby face detected".
4. REAL HUMAN BABY ONLY: If a doll, plush toy, drawing, illustration, artwork, or animal is shown, set "face_lock": "toy or non-human detected".
5. CLEAR & UNOBSTRUCTED: If a pacifier, hand, cloth, mask, or blanket covers a major portion of the face, set "face_lock": "face obstructed by pacifier or hand".
6. FRONT OR 3/4 ANGLED FACE VIEW ONLY (STRICT): Both eyes of the baby MUST be clearly visible. If the baby is shown in a full 90-degree side profile, side view, looking far sideways/upwards where only ONE eye is visible, or showing the back/side of the head, set "face_lock": "extreme face angle - side profile".
7. IMAGE QUALITY & LIGHTING: If the image is severely blurry, out of focus, or pitch dark, set "texture_lock": "too blurry or dark".

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

  // 1. Group / Multiple Faces Check
  const groupKeywords = [
    "multiple faces",
    "group photo",
    "multiple people",
    "more than one face",
    "several faces",
  ];
  if (values.some((val) => groupKeywords.some((keyword) => val.includes(keyword)))) {
    const error = new Error("Multiple faces detected. Please upload a photo focused on a single baby face.");
    error.code = "MULTIPLE_FACES_DETECTED";
    error.status = 400;
    throw error;
  }

  // 2. Adult / Not a Baby Check
  const adultKeywords = [
    "adult",
    "teenager",
    "teen",
    "older person",
    "not a baby",
    "elderly",
    "grown up",
  ];
  if (values.some((val) => adultKeywords.some((keyword) => val.includes(keyword)))) {
    const error = new Error("This image appears to show an adult or older person. Please upload a photo of a baby (0-3 years).");
    error.code = "NOT_A_BABY";
    error.status = 400;
    throw error;
  }

  // 3. Toy / Doll / Illustration Check
  const nonHumanKeywords = [
    "toy or non-human",
    "doll",
    "teddy bear",
    "plush",
    "drawing",
    "illustration",
    "cartoon",
    "anime",
    "artwork",
  ];
  if (values.some((val) => nonHumanKeywords.some((keyword) => val.includes(keyword)))) {
    const error = new Error("A real baby face was not detected (doll, toy, or drawing detected). Please upload a photo of a real baby.");
    error.code = "NON_HUMAN_SUBJECT";
    error.status = 400;
    throw error;
  }

  // 4. Face Obstruction Check (Pacifier / Hand / Mask / Blanket)
  const obstructionKeywords = [
    "obstructed",
    "pacifier",
    "covered face",
    "hand covering",
    "blanket covering",
    "mask covering",
  ];
  if (values.some((val) => obstructionKeywords.some((keyword) => val.includes(keyword)))) {
    const error = new Error("The baby's face is partially covered (e.g. pacifier, hand, or blanket). Please upload an unobstructed photo.");
    error.code = "FACE_OBSTRUCTED";
    error.status = 400;
    throw error;
  }

  // 5. Extreme Angle Check (Back of head / steep profile / side view)
  const angleKeywords = [
    "extreme face angle",
    "side profile",
    "side view",
    "profile view",
    "one eye visible",
    "only one eye",
    "turned sideways",
    "turned away",
    "back of head",
    "looking sideways",
    "looking upwards",
    "side face",
  ];
  if (values.some((val) => angleKeywords.some((keyword) => val.includes(keyword)))) {
    const error = new Error("The baby's face is turned too far away. Please upload a front-facing or slightly angled photo.");
    error.code = "EXTREME_ANGLE";
    error.status = 400;
    throw error;
  }

  // 6. Severe Blur or Dark Image Check
  const qualityKeywords = [
    "too blurry or dark",
    "severely blurry",
    "pixelated",
    "out of focus",
    "pitch dark",
  ];
  if (values.some((val) => qualityKeywords.some((keyword) => val.includes(keyword)))) {
    const error = new Error("The photo is too blurry, dark, or low quality. Please upload a clear, well-lit photo.");
    error.code = "IMAGE_TOO_BLURRY";
    error.status = 400;
    throw error;
  }

  // 7. No Face Detected Check
  const invalidKeywords = [
    "no baby face detected",
    "no face detected",
    "face not detected",
    "no baby detected",
    "unable to detect baby face",
    "cannot detect face",
    "no visible face",
  ];
  if (values.some((value) => invalidKeywords.some((keyword) => value.includes(keyword)))) {
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
      
      // If error is about face/age/group/quality validation, clean up the uploaded image
      if (
        aiError.code === "NO_BABY_FACE_DETECTED" ||
        aiError.code === "MULTIPLE_FACES_DETECTED" ||
        aiError.code === "NOT_A_BABY" ||
        aiError.code === "NON_HUMAN_SUBJECT" ||
        aiError.code === "FACE_OBSTRUCTED" ||
        aiError.code === "EXTREME_ANGLE" ||
        aiError.code === "IMAGE_TOO_BLURRY"
      ) {
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
