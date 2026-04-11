const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const BabyProfile = require('../models/BabyProfile');

// Initialize Gemini using your real API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.uploadAndAnalyze = async (req, res) => {
  try {
    const userId = req.user.id; 
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'No image provided' });
    }

    console.log('1. Image saved locally to:', file.path);
    
    // Create the URL based on your laptop's local IP address
    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;

    let identityJson;

    // Check if we should use the real Gemini API or a Mock
    const useRealGemini = process.env.USE_GEMINI_API === 'true';

    if (!useRealGemini) {
      console.log('2. [MOCK MODE] Skipping real Gemini API call. Using mock data...');
      identityJson = {
        age_range: "0-6 months",
        gender: "neutral",
        face_lock: "round baby face",
        skin_tone: "fair/natural",
        texture_lock: "soft skin",
        expression_lock: "calm/neutral"
      };
    } else {
      console.log('2. Analyzing face with REAL Gemini 2.0 Flash API...');
      
      // Read the image file from your laptop's hard drive
      const fileBuffer = fs.readFileSync(file.path);
      const imagePart = {
        inlineData: {
          data: fileBuffer.toString("base64"),
          mimeType: file.mimetype
        }
      };

      const systemPrompt = `You are an Elite newborn facial identity extraction specialist. 
      Analyze the attached baby image and extract ONLY the identity-critical facial attributes required for strict preservation in downstream photoshoot generation.
      Return ONLY a raw JSON object with the following keys: age_range, gender, face_lock, skin_tone, texture_lock, expression_lock.
      Do NOT include markdown formatting or backticks in your response.`;

      try {
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.0-flash",
            generationConfig: { responseMimeType: "application/json" } 
        });
        
        const result = await model.generateContent([systemPrompt, imagePart]);
        const responseText = result.response.text();
        identityJson = JSON.parse(responseText);
      } catch (geminiError) {
        console.error('Gemini API Error:', geminiError);
        
        if (geminiError.status === 429) {
          return res.status(429).json({
            message: 'Gemini 2.0 Flash Quota Exceeded. Please ensure billing is linked in Google AI Studio or set USE_GEMINI_API=false in .env to use mock data.',
            error: geminiError.message
          });
        }
        throw geminiError; // Let the main catch block handle other errors
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
      message: useRealGemini ? 'Baby face analyzed successfully' : 'Baby face analyzed successfully (MOCK DATA)',
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