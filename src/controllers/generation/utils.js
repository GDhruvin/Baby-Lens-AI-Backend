// src/controllers/generation/utils.js

const admin = require("../../config/firebase");


// Removed deprecated storage URL functions

function hasInvalidIdentity(identityJson) {
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

  return values.some((value) =>
    invalidKeywords.some((keyword) => value.includes(keyword)),
  );
}

function buildFinalPrompt(themePromptTemplate, identityJson) {
  const identityBlock = JSON.stringify(identityJson, null, 2);
  let finalPrompt = themePromptTemplate || "";

  if (finalPrompt.includes("{{identity_json}}")) {
    finalPrompt = finalPrompt.replace("{{identity_json}}", identityBlock);
  } else {
    finalPrompt = `${finalPrompt}

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

    const { getFirebaseDownloadUrl } = require("../../utils/storageUtils");

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

module.exports = {
  hasInvalidIdentity,
  buildFinalPrompt,
  extractGeneratedImages,
  uploadGeneratedImages
};
