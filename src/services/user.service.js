const admin = require("../config/firebase");
const User = require("../models/user.model");
const Device = require("../models/device.model");
const BabyProfile = require("../models/babyProfile.model");
const Generation = require("../models/generation.model");
const DeviceToken = require("../models/deviceToken.model");
const Purchase = require("../models/purchase.model");
const { deleteFromFirebase } = require("../utils/storageUtils");

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

/**
 * Permanently delete a user account, including all cloud assets,
 * database records, device linkages, and Firebase Auth identity.
 * @param {string|mongoose.Types.ObjectId} userId - MongoDB User ID
 * @param {string} authUid - Firebase Auth UID
 * @returns {Promise<boolean>}
 */
async function deleteUserAccount(userId, authUid) {
  console.log(`[deleteUserAccount] Starting account deletion for user: ${userId}`);

  // 1. Clean up individual storage assets
  try {
    const babyProfiles = await BabyProfile.find({ user_id: userId }, "reference_image_url").lean();
    for (const profile of babyProfiles) {
      if (profile.reference_image_url) {
        await deleteFromFirebase(profile.reference_image_url).catch((err) => {
          console.warn(`[deleteUserAccount] Failed to delete baby profile image: ${err.message}`);
        });
      }
    }

    const generations = await Generation.find({ user_id: userId }, "output_image_url").lean();
    for (const gen of generations) {
      if (gen.output_image_url) {
        await deleteFromFirebase(gen.output_image_url).catch((err) => {
          console.warn(`[deleteUserAccount] Failed to delete generation image: ${err.message}`);
        });
      }
    }

    // Also delete any remaining folder contents in Firebase Storage
    const bucket = admin.storage().bucket();
    await bucket.deleteFiles({ prefix: `baby_profiles/${userId}/` }).catch(() => {});
    await bucket.deleteFiles({ prefix: `generated_outputs/${userId}/` }).catch(() => {});
  } catch (storageErr) {
    console.warn(`[deleteUserAccount] Storage cleanup error (continuing with DB deletion): ${storageErr.message}`);
  }

  // 2. Cascade MongoDB deletions
  await Promise.all([
    BabyProfile.deleteMany({ user_id: userId }),
    Generation.deleteMany({ user_id: userId }),
    DeviceToken.deleteMany({ user_id: userId }),
    Purchase.deleteMany({ user_id: userId }),
    Device.updateMany({ linked_users: userId }, { $pull: { linked_users: userId } }),
    User.findByIdAndDelete(userId),
  ]);

  // 3. Delete Firebase Auth user record
  if (authUid) {
    try {
      await admin.auth().deleteUser(authUid);
      console.log(`[deleteUserAccount] Successfully deleted Firebase Auth user: ${authUid}`);
    } catch (fbErr) {
      // If user was already deleted from Firebase or auth error, log warning without breaking the flow
      console.warn(`[deleteUserAccount] Firebase Auth deletion warning for ${authUid}: ${fbErr.message}`);
    }
  }

  console.log(`[deleteUserAccount] Account deletion complete for user: ${userId}`);
  return true;
}

module.exports = {
  verifyFirebaseToken,
  findOrCreateUser,
  linkDevice,
  loginUser,
  deleteUserAccount,
};
