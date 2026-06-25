const admin = require("../config/firebase");
const User = require("../models/user.model");
const Device = require("../models/device.model");

/**
 * Verify Firebase ID token
 * @param {string} idToken 
 * @returns {Promise<object>} Decoded token containing uid, email, name
 */
async function verifyFirebaseToken(idToken) {
  try {
    return await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    console.error("Firebase token verification failed:", error);
    const err = new Error("Authentication failed. Invalid or expired token.");
    err.status = 401;
    throw err;
  }
}

/**
 * Find an existing user by their Firebase UID or create a new one
 * @param {object} userData
 * @param {string} userData.uid
 * @param {string} userData.email
 * @param {string} userData.name
 * @returns {Promise<object>} The User document
 */
async function findOrCreateUser({ uid, email, name }) {
  let user = await User.findOne({ auth_uid: uid });

  if (!user) {
    user = new User({
      auth_uid: uid,
      name: name || "BabyLens User",
      email: email,
      free_generations_used: 0,
    });
    await user.save();
    console.log(`New user registered: ${email}`);
  }
  return user;
}

/**
 * Link a device to a user and register it if seen for the first time
 * @param {string} deviceId 
 * @param {string} userId 
 */
async function linkDevice(deviceId, userId) {
  if (!deviceId) return;

  let device = await Device.findOne({ device_id: deviceId });

  if (!device) {
    device = new Device({
      device_id: deviceId,
      first_user_id: userId,
      linked_users: [userId],
    });
    await device.save();
  } else {
    if (!device.linked_users.includes(userId)) {
      device.linked_users.push(userId);
      await device.save();
    }
  }
}

/**
 * Main business logic for authenticating a user via Firebase Token and device fingerprint
 * @param {string} authHeader - The Authorization header (Bearer <token>)
 * @param {string} deviceId - The device ID for fingerprinting
 * @returns {Promise<object>} The authenticated user document
 */
async function loginUser(authHeader, deviceId) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    const error = new Error("Missing or invalid token");
    error.status = 401;
    throw error;
  }

  const idToken = authHeader.split("Bearer ")[1];
  
  // 1. Verify the Token with Firebase
  const decodedToken = await verifyFirebaseToken(idToken);
  const { uid, email, name } = decodedToken;

  // 2. Find or Create the User in MongoDB
  const user = await findOrCreateUser({ uid, email, name });

  // 3. Handle Device Fingerprinting
  await linkDevice(deviceId, user._id);

  return user;
}

module.exports = {
  verifyFirebaseToken,
  findOrCreateUser,
  linkDevice,
  loginUser,
};
