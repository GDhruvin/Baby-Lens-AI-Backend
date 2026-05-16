// src/controllers/generation/utils.js

const admin = require("../../config/firebase");

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
  const uploadedUrls = [];

  for (const image of generatedImages) {
    const extension = image.mimeType.includes("jpeg") ? "jpg" : "png";
    const cloudFileName = `generated_outputs/${userId}/${Date.now()}_${image.index}.${extension}`;
    const fileRef = bucket.file(cloudFileName);

    await fileRef.save(Buffer.from(image.data, "base64"), {
      metadata: {
        contentType: image.mimeType,
      },
    });

    const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${
      bucket.name
    }/o/${encodeURIComponent(cloudFileName)}?alt=media`;

    uploadedUrls.push(imageUrl);
  }

  return uploadedUrls;
}

module.exports = {
  toSignedStorageUrl,
  hasInvalidIdentity,
  buildFinalPrompt,
  extractGeneratedImages,
  uploadGeneratedImages
};
