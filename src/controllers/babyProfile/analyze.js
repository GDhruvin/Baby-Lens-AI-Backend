// src/controllers/babyProfile/analyze.js

const admin = require("../../config/firebase");
const BabyProfile = require("../../models/BabyProfile");
const {
  useRealGemini,
  vertexModel,
  safeParseJson,
  validateBabyFaceDetected,
  deleteUploadedImage,
  generateIdentityJson,
  mockIdentity
} = require("./utils");

module.exports = async (req, res) => {
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
