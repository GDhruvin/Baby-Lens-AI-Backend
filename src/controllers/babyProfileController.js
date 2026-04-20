// src/controllers/babyProfileController.js
const { GoogleGenAI } = require('@google/genai');
const admin = require('../config/firebase');
const BabyProfile = require('../models/BabyProfile');

const useRealGemini = process.env.USE_GEMINI_API === 'true';
const hasVertexConfig = Boolean(
  process.env.GCP_PROJECT_ID && process.env.GOOGLE_APPLICATION_CREDENTIALS
);

const vertexModel = process.env.VERTEX_MODEL || 'gemini-2.5-flash';
const geminiApiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const fallbackModels = ['gemini-2.5-flash', 'gemini-2.0-flash'];

const mockIdentity = {
  age_range: '0-6 months',
  gender: 'neutral',
  face_lock: 'round baby face',
  skin_tone: 'fair/natural',
  texture_lock: 'soft skin',
  expression_lock: 'calm/neutral'
};

const systemPrompt = `You are an Elite newborn facial identity extraction specialist.
Analyze the attached baby image and extract ONLY the identity-critical facial attributes required for strict preservation in downstream photoshoot generation.
Return ONLY a raw JSON object with the following keys: age_range, gender, face_lock, skin_tone, texture_lock, expression_lock.
Do NOT include markdown formatting or backticks in your response.`;

const ai = useRealGemini
  ? new GoogleGenAI(
      hasVertexConfig
        ? {
            vertexai: true,
            project: process.env.GCP_PROJECT_ID,
            location: process.env.GCP_LOCATION || 'us-central1',
          }
        : {
            apiKey: process.env.GEMINI_API_KEY,
          }
    )
  : null;

async function generateWithModelFallback(file, initialModel) {
  const modelCandidates = [...new Set([initialModel, ...fallbackModels])];
  let lastError = null;

  for (const modelName of modelCandidates) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: [
              { text: systemPrompt },
              {
                inlineData: {
                  data: file.buffer.toString('base64'),
                  mimeType: file.mimetype
                }
              }
            ]
          }
        ],
        config: {
          responseMimeType: 'application/json',
        }
      });

      console.log(`Gemini response received from model: ${modelName}`);
      return response;
    } catch (error) {
      lastError = error;
      if (error.status === 404) {
        console.warn(`Model not available: ${modelName}. Trying next fallback...`);
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error('No available Gemini model was found.');
}

exports.uploadAndAnalyze = async (req, res) => {
  try {
    const userId = req.user.id;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'No image provided' });
    }

    console.log('1. Uploading image directly to Firebase Storage...');
    const bucket = admin.storage().bucket();

    const safeFilename = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    const cloudFileName = `baby_profiles/${userId}/${Date.now()}_${safeFilename}`;
    const fileRef = bucket.file(cloudFileName);

    await fileRef.save(file.buffer, {
      metadata: { contentType: file.mimetype }
    });

    const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(cloudFileName)}?alt=media`;
    console.log('Image secured at:', imageUrl);

    let identityJson;
    if (!useRealGemini) {
      console.log('2. [MOCK MODE] Skipping real API call. Using mock data...');
      identityJson = mockIdentity;
    } else {
      const aiMode = hasVertexConfig ? 'Vertex AI' : 'Gemini Developer API';
      const initialModel = hasVertexConfig ? vertexModel : geminiApiModel;
      console.log(`2. Analyzing face with REAL ${aiMode} (${initialModel}) via GenAI SDK...`);

      try {
        const response = await generateWithModelFallback(file, initialModel);
        identityJson = JSON.parse(response.text);
      } catch (aiError) {
        console.error('GenAI API Error:', aiError);

        if (aiError.status === 401) {
          const authHint = hasVertexConfig
            ? 'Vertex AI requires OAuth credentials with a valid service account and Vertex AI API access.'
            : 'Gemini Developer API requires a valid GEMINI_API_KEY.';
          return res.status(401).json({
            message: `Authentication failed for ${aiMode}. ${authHint}`,
            error: aiError.message
          });
        }

        if (aiError.message && aiError.message.includes('Quota')) {
          return res.status(429).json({
            message: 'Vertex AI Quota Exceeded. Please check your Google Cloud quotas or set USE_GEMINI_API=false in .env.',
            error: aiError.message
          });
        }

        throw aiError;
      }
    }

    console.log('3. Saving Baby Profile to Database...');
    const newProfile = new BabyProfile({
      user_id: userId,
      reference_image_url: imageUrl,
      identity_json: identityJson
    });

    await newProfile.save();

    console.log('Analysis Complete!');

    return res.status(200).json({
      message: useRealGemini ? 'Baby face analyzed successfully via Vertex AI' : 'Baby face analyzed successfully (MOCK DATA)',
      profile_id: newProfile._id,
      image_url: imageUrl,
      analysis: identityJson
    });
  } catch (error) {
    console.error('Upload/Analyze Error:', error);
    return res.status(500).json({
      message: 'Failed to analyze image. Please ensure the face is clearly visible.',
      error: error.message
    });
  }
};
