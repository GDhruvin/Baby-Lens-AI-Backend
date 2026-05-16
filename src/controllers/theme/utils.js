// src/controllers/theme/utils.js

const admin = require("../../config/firebase");

const toSignedThemeImageUrl = async (imageUrl) => {
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

    const cloudPath = decodeURIComponent(encodedPath);
    const bucket = admin.storage().bucket();
    const [signedUrl] = await bucket.file(cloudPath).getSignedUrl({
      action: "read",
      expires: "01-01-2036",
    });

    return signedUrl || imageUrl;
  } catch (error) {
    console.warn("[Themes] Failed to normalize image URL:", error.message);
    return imageUrl;
  }
};

module.exports = {
  toSignedThemeImageUrl
};
