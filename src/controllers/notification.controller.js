const notificationService = require("../services/notification.service");
const userService = require("../services/user.service");
const User = require("../models/user.model");

/**
 * Register or update an FCM device token
 * POST /api/notifications/register-token
 */
async function registerToken(req, res, next) {
  try {
    const { fcm_token, device_id, platform } = req.body || {};

    if (!fcm_token || !device_id) {
      return res.status(400).json({
        message: "fcm_token and device_id are required",
      });
    }

    let userId = null;

    // Check if user is authenticated via Bearer token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const idToken = authHeader.split("Bearer ")[1];
        const decodedToken = await userService.verifyFirebaseToken(idToken);
        const user = await User.findOne({ auth_uid: decodedToken.uid });
        if (user) {
          userId = user._id;
        }
      } catch (authErr) {
        // Token might be invalid or expired; proceed with userId as null
        console.warn("[NotificationController] Optional auth resolution failed:", authErr.message);
      }
    }

    const tokenDoc = await notificationService.registerToken({
      userId,
      deviceId: device_id,
      fcmToken: fcm_token,
      platform,
    });

    return res.status(200).json({
      message: "Device token registered successfully",
      data: {
        id: tokenDoc._id,
        user_id: tokenDoc.user_id,
        device_id: tokenDoc.device_id,
        is_active: tokenDoc.is_active,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Deactivate a device token upon logout
 * POST /api/notifications/remove-token
 */
async function removeToken(req, res, next) {
  try {
    const { fcm_token, device_id } = req.body || {};

    await notificationService.deactivateToken({
      fcmToken: fcm_token,
      deviceId: device_id,
    });

    return res.status(200).json({
      message: "Device token deactivated successfully",
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  registerToken,
  removeToken,
};
