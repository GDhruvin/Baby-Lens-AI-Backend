const admin = require("../config/firebase");
const DeviceToken = require("../models/deviceToken.model");

/**
 * Register or refresh a device's FCM push token
 */
async function registerToken({ userId = null, deviceId, fcmToken, platform = "android" }) {
  if (!fcmToken || !deviceId) {
    throw new Error("fcmToken and deviceId are required");
  }

  const normalizedPlatform = String(platform).toLowerCase() === "ios" ? "ios" : "android";

  // Upsert token in MongoDB
  const tokenDoc = await DeviceToken.findOneAndUpdate(
    { fcm_token: fcmToken },
    {
      user_id: userId || null,
      device_id: deviceId,
      fcm_token: fcmToken,
      platform: normalizedPlatform,
      is_active: true,
      last_seen_at: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Automatically subscribe token to global announcements topic
  try {
    await admin.messaging().subscribeToTopic([fcmToken], "new_themes");
  } catch (err) {
    console.warn("[NotificationService] Failed to auto-subscribe token to topic:", err?.message);
  }

  return tokenDoc;
}

/**
 * Deactivate token on user logout
 */
async function deactivateToken({ fcmToken, deviceId }) {
  const query = {};
  if (fcmToken) query.fcm_token = fcmToken;
  else if (deviceId) query.device_id = deviceId;
  else return;

  await DeviceToken.updateMany(query, { is_active: false });
}

/**
 * Internal helper to send push message to an array of tokens
 */
async function sendToTokens(tokens, { title, body, data = {}, imageUrl = null, channelId = "photoshoot_status" }) {
  if (!tokens || tokens.length === 0) return { successCount: 0, failureCount: 0 };

  const message = {
    notification: {
      title,
      body,
      ...(imageUrl ? { imageUrl } : {}),
    },
    data: Object.fromEntries(
      Object.entries({
        ...data,
        ...(imageUrl ? { image_url: imageUrl, image: imageUrl } : {}),
      }).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])
    ),
    android: {
      priority: "high",
      notification: {
        channelId,
        sound: "default",
        defaultVibrateTimings: true,
        priority: "high",
        ...(imageUrl ? { imageUrl } : {}),
      },
    },
    apns: {
      payload: {
        aps: {
          sound: "default",
          badge: 1,
          "mutable-content": 1,
        },
      },
      ...(imageUrl ? { fcmOptions: { image: imageUrl } } : {}),
    },
    tokens,
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);

    // Clean up stale or unregistered tokens
    const invalidTokens = [];
    response.responses.forEach((res, index) => {
      if (!res.success && res.error) {
        const errCode = res.error.code;
        if (
          errCode === "messaging/registration-token-not-registered" ||
          errCode === "messaging/invalid-registration-token"
        ) {
          invalidTokens.push(tokens[index]);
        }
      }
    });

    if (invalidTokens.length > 0) {
      await DeviceToken.updateMany(
        { fcm_token: { $in: invalidTokens } },
        { is_active: false }
      );
      console.log(`[NotificationService] Deactivated ${invalidTokens.length} stale FCM tokens.`);
    }

    return response;
  } catch (err) {
    console.error("[NotificationService] Error sending multicast push:", err);
    return { successCount: 0, failureCount: tokens.length, error: err.message };
  }
}

/**
 * Send notification to all active devices of a specific user
 */
async function sendToUser(userId, payload) {
  if (!userId) return null;

  const devices = await DeviceToken.find({ user_id: userId, is_active: true }).select("fcm_token").lean();
  const tokens = devices.map((d) => d.fcm_token).filter(Boolean);

  if (tokens.length === 0) {
    return { successCount: 0, failureCount: 0, message: "No active device tokens found for user" };
  }

  return sendToTokens(tokens, payload);
}

/**
 * Broadcast notification to a topic (e.g. 'new_themes')
 */
async function sendToTopic(topic, { title, body, data = {}, imageUrl = null, channelId = "theme_updates" }) {
  const message = {
    topic,
    notification: {
      title,
      body,
      ...(imageUrl ? { imageUrl } : {}),
    },
    data: Object.fromEntries(
      Object.entries({
        ...data,
        ...(imageUrl ? { image_url: imageUrl, image: imageUrl } : {}),
      }).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])
    ),
    android: {
      priority: "high",
      notification: {
        channelId,
        sound: "default",
        priority: "high",
        ...(imageUrl ? { imageUrl } : {}),
      },
    },
    apns: {
      payload: {
        aps: {
          sound: "default",
          "mutable-content": 1,
        },
      },
      ...(imageUrl ? { fcmOptions: { image: imageUrl } } : {}),
    },
  };

  try {
    const response = await admin.messaging().send(message);
    console.log(`[NotificationService] Broadcast sent to topic '${topic}':`, response);
    return { success: true, messageId: response };
  } catch (err) {
    console.error(`[NotificationService] Failed to send topic push to '${topic}':`, err);
    return { success: false, error: err.message };
  }
}

/**
 * 1. AI Photoshoot Status: Generation Completed
 */
async function notifyGenerationComplete({ userId, generationId, themeLabel, imageUrl }) {
  const title = "✨ Your Baby Photoshoot is Ready!";
  const body = themeLabel
    ? `The "${themeLabel}" portrait is ready! Tap to view the magic.`
    : "Your baby's studio portrait has been rendered! Tap to view.";

  return sendToUser(userId, {
    title,
    body,
    imageUrl: imageUrl || null,
    channelId: "photoshoot_status",
    data: {
      type: "GENERATION_COMPLETE",
      generation_id: String(generationId),
      theme_name: String(themeLabel || ""),
    },
  });
}

/**
 * 1b. AI Photoshoot Status: Generation Failed
 */
async function notifyGenerationFailed({ userId, themeLabel, errorMessage }) {
  const title = "Photoshoot Generation Update";
  const body = "We couldn't generate the portrait with that photo. Any used credits were refunded. Tap to try again with a clearer picture.";

  return sendToUser(userId, {
    title,
    body,
    channelId: "photoshoot_status",
    data: {
      type: "GENERATION_FAILED",
      theme_name: String(themeLabel || ""),
      error_message: String(errorMessage || ""),
    },
  });
}

/**
 * 2. New Themes & Seasonal Festivals: Broadcast Announcement
 */
async function notifyNewTheme({ themeId, themeLabel, categoryName, previewImageUrl }) {
  const title = `🚀 New Theme Alert: ${themeLabel || "Special Baby Portrait"}!`;
  const body = categoryName
    ? `New in ${categoryName}: Turn your baby's photo into a stunning studio portrait now.`
    : `A brand-new photoshoot theme is now live. Tap to preview!`;

  return sendToTopic("new_themes", {
    title,
    body,
    imageUrl: previewImageUrl || null,
    channelId: "theme_updates",
    data: {
      type: "NEW_THEME",
      theme_id: String(themeId),
      theme_label: String(themeLabel || ""),
    },
  });
}

module.exports = {
  registerToken,
  deactivateToken,
  sendToTokens,
  sendToUser,
  sendToTopic,
  notifyGenerationComplete,
  notifyGenerationFailed,
  notifyNewTheme,
};
