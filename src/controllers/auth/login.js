// src/controllers/auth/login.js

const admin = require("../../config/firebase");
const User = require("../../models/User");
const Device = require("../../models/Device");

module.exports = async (req, res) => {
  try {
    // 1. Extract the Firebase Token and Device ID
    const authHeader = req.headers.authorization;
    const { deviceId } = req.body;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Missing or invalid token" });
    }

    const idToken = authHeader.split("Bearer ")[1];

    // 2. Verify the Token with Firebase
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    // Extract the user's data directly from the verified token
    const { uid, email, name } = decodedToken;

    // 3. Find or Create the User in MongoDB
    let user = await User.findOne({ auth_uid: uid });

    if (!user) {
      // First-time login: Create the user profile
      user = new User({
        auth_uid: uid,
        name: name || "BabyLens User", // Fallback just in case Google doesn't provide a name
        email: email,
        free_generations_used: 0,
      });
      await user.save();
      console.log(`New user registered: ${email}`);
    }

    // 4. Handle Device Fingerprinting (Abuse Prevention)
    if (deviceId) {
      let device = await Device.findOne({ device_id: deviceId });

      if (!device) {
        // First time seeing this device, register it
        device = new Device({
          device_id: deviceId,
          first_user_id: user._id,
          linked_users: [user._id],
        });
        await device.save();
      } else {
        // Device exists, but is this user linked to it yet?
        if (!device.linked_users.includes(user._id)) {
          device.linked_users.push(user._id);
          await device.save();
        }
      }
    }

    // 5. Send the exact response format your Frontend `httpService.ts` expects
    res.status(200).json({
      message: "Authentication successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        free_generations_used: user.free_generations_used,
        paid_credits: user.paid_credits,
      },
    });
  } catch (error) {
    console.error("Auth Controller Error:", error);
    res
      .status(401)
      .json({ message: "Authentication failed. Invalid or expired token." });
  }
};
