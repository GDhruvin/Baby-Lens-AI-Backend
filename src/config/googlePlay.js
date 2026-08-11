const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

let androidPublisherClient = null;

/**
 * Returns an authenticated Google Play Android Publisher API client instance.
 */
function getAndroidPublisherClient() {
  if (androidPublisherClient) {
    return androidPublisherClient;
  }

  let credentials = null;

  // 1. Check process.env.GOOGLE_PLAY_CREDENTIALS_JSON
  if (process.env.GOOGLE_PLAY_CREDENTIALS_JSON) {
    try {
      credentials = JSON.parse(process.env.GOOGLE_PLAY_CREDENTIALS_JSON);
    } catch (err) {
      console.error("[GooglePlayConfig] Error parsing GOOGLE_PLAY_CREDENTIALS_JSON:", err.message);
    }
  }

  // 2. Fallback to file path
  if (!credentials) {
    const credPath =
      process.env.GOOGLE_PLAY_CREDENTIALS_PATH ||
      path.join(__dirname, "google-play-service-account.json");

    if (fs.existsSync(credPath)) {
      try {
        const fileContent = fs.readFileSync(credPath, "utf8");
        credentials = JSON.parse(fileContent);
      } catch (err) {
        console.error(`[GooglePlayConfig] Error reading credentials file from ${credPath}:`, err.message);
      }
    }
  }

  if (!credentials) {
    throw new Error(
      "Google Play Developer API service account credentials not configured. Please set GOOGLE_PLAY_CREDENTIALS_JSON or place google-play-service-account.json inside backend/src/config/."
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });

  androidPublisherClient = google.androidpublisher({
    version: "v3",
    auth,
  });

  return androidPublisherClient;
}

const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME || "com.babylens";

module.exports = {
  getAndroidPublisherClient,
  packageName,
};
