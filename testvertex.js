// testVertex.js

const { GoogleGenAI } = require("@google/genai");
require("dotenv").config();

const ai = new GoogleGenAI({
  vertexai: true,
  project: process.env.GCP_PROJECT_ID,
  location: process.env.GCP_LOCATION || "us-central1",
});

async function testGemini() {
  try {
    const response = await ai.models.generateContent({
      model: process.env.VERTEX_MODEL || "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Say hello in one line"
            }
          ]
        }
      ]
    });

    console.log("Response:", response.text);
  } catch (error) {
    console.error("Vertex AI Error:", error);
  }
}

testGemini();
