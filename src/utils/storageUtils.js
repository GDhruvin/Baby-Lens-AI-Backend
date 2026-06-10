// src/utils/storageUtils.js

const admin = require("../config/firebase");
const { getDownloadURL } = require("firebase-admin/storage");

// Simple in-memory LRU cache to avoid hammering the Firebase Admin SDK
// and dramatically speed up list/gallery endpoints.
class SimpleLRUCache {
  constructor(limit = 1000) {
    this.cache = new Map();
    this.limit = limit;
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;
    const value = this.cache.get(key);
    // Refresh position to signify recently used
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.limit) {
      // Remove oldest (first item in Map)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}

const urlCache = new SimpleLRUCache(1000);

/**
 * Gets a valid Download URL for a given cloud path or legacy URL.
 * Transparently migrates legacy Storage Object URLs and Signed URLs.
 * Uses an LRU cache for performance.
 * 
 * @param {string} cloudPathOrUrl - The cloud path (e.g. "baby_profiles/123/file.jpg") or legacy URL
 * @returns {Promise<string|null>} The Firebase Download URL
 */
async function getFirebaseDownloadUrl(cloudPathOrUrl) {
  if (!cloudPathOrUrl) return null;

  // Check cache first
  const cachedUrl = urlCache.get(cloudPathOrUrl);
  if (cachedUrl) return cachedUrl;

  try {
    const bucket = admin.storage().bucket();
    let cloudPath = cloudPathOrUrl;

    // Legacy data migration: If it's a full URL, extract the cloud path
    if (cloudPathOrUrl.startsWith("http")) {
      const parsed = new URL(cloudPathOrUrl);
      
      // If it's already a Download URL (has token), return it immediately
      // Download URLs don't technically expire unless revoked.
      if (parsed.searchParams.has("token")) {
        urlCache.set(cloudPathOrUrl, cloudPathOrUrl);
        return cloudPathOrUrl;
      }

      if (parsed.pathname.includes("/o/")) {
        // Storage Object URL format
        cloudPath = decodeURIComponent(parsed.pathname.split("/o/")[1].split("?")[0]);
      } else if (parsed.hostname === "storage.googleapis.com") {
        const pathParts = parsed.pathname.split("/").filter(Boolean);
        if (pathParts[0] === bucket.name) pathParts.shift();
        cloudPath = decodeURIComponent(pathParts.join("/"));
      } else {
        // Other URL formats where the pathname is already the cloud path
        cloudPath = decodeURIComponent(parsed.pathname.substring(1));
      }
    }

    // Generate fresh download URL
    const file = bucket.file(cloudPath);
    const downloadUrl = await getDownloadURL(file);
    
    // Save to cache
    urlCache.set(cloudPathOrUrl, downloadUrl);
    
    return downloadUrl;
  } catch (error) {
    console.error(`[storageUtils] Failed to generate download URL for ${cloudPathOrUrl}:`, error.message);
    // If it was a legacy URL and extraction failed, return it as a fallback
    return cloudPathOrUrl.startsWith("http") ? cloudPathOrUrl : null;
  }
}

/**
 * Uploads a buffer directly to Firebase Storage
 * 
 * @param {string} cloudPath - Target destination in bucket
 * @param {Buffer} buffer - File buffer
 * @param {string} mimetype - Content type
 * @returns {Promise<string>} The generated Download URL for immediate use
 */
async function uploadBufferToFirebase(cloudPath, buffer, mimetype) {
  const bucket = admin.storage().bucket();
  const fileRef = bucket.file(cloudPath);

  await fileRef.save(buffer, {
    metadata: {
      contentType: mimetype || "application/octet-stream",
    },
  });

  return await getFirebaseDownloadUrl(cloudPath);
}

/**
 * Deletes a file from Firebase Storage
 * 
 * @param {string} cloudPathOrUrl - Target destination or legacy URL
 */
async function deleteFromFirebase(cloudPathOrUrl) {
  if (!cloudPathOrUrl) return;

  let cloudPath = cloudPathOrUrl;
  if (cloudPathOrUrl.startsWith("http")) {
    try {
      const bucket = admin.storage().bucket();
      const parsed = new URL(cloudPathOrUrl);
      if (parsed.pathname.includes("/o/")) {
        cloudPath = decodeURIComponent(parsed.pathname.split("/o/")[1].split("?")[0]);
      } else if (parsed.hostname === "storage.googleapis.com") {
        const pathParts = parsed.pathname.split("/").filter(Boolean);
        if (pathParts[0] === bucket.name) pathParts.shift();
        cloudPath = decodeURIComponent(pathParts.join("/"));
      } else {
        cloudPath = decodeURIComponent(parsed.pathname.substring(1));
      }
    } catch (e) {
      console.warn(`[storageUtils] Failed to parse legacy URL for deletion: ${cloudPathOrUrl}`);
      return;
    }
  }

  try {
    const bucket = admin.storage().bucket();
    await bucket.file(cloudPath).delete();
  } catch (error) {
    console.error(`[storageUtils] Failed to delete ${cloudPath}:`, error.message);
  }
}

module.exports = {
  getFirebaseDownloadUrl,
  uploadBufferToFirebase,
  deleteFromFirebase,
};
