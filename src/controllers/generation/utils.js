// src/controllers/generation/utils.js

const admin = require("../../config/firebase");


function buildFirebaseStorageObjectUrl(bucketName, cloudPath) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(cloudPath)}`;
}

const { getDownloadURL } = require("firebase-admin/storage");

async function signCloudPath(bucket, cloudPath) {
  const file = bucket.file(cloudPath);
  return await getDownloadURL(file);
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
    console.warn("[Generations] Failed to normalize reference URL:", error.message);
    return imageUrl;
  }
}

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

    await fileRef.save(Buffer.from(image.data, "base64"), {
      metadata: {
        contentType: image.mimeType,
      },
    });

    const signedUrl = await signCloudPath(bucket, cloudFileName);
    const storageObjectUrl = buildFirebaseStorageObjectUrl(bucket.name, cloudFileName);

    uploadedImages.push({
      signedUrl,
      storageObjectUrl,
    });
  }

  return uploadedImages;
}

module.exports = {
  buildFirebaseStorageObjectUrl,
  signCloudPath,
  toSignedStorageUrl,
  hasInvalidIdentity,
  buildFinalPrompt,
  extractGeneratedImages,
  uploadGeneratedImages
};
