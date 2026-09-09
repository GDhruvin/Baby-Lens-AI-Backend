const userService = require("../services/user.service");
const User = require("../models/user.model");

/**
 * Authenticates user via Firebase token and device ID, then returns user profile
 */
async function login(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const { deviceId } = req.body;

    const user = await userService.loginUser(authHeader, deviceId);

    return res.status(200).json({
      message: "Authentication successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        free_generations_used: user.free_generations_used,
        paid_credits: user.paid_credits,
        hasPurchased: user.hasPurchased,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieves authenticated user profile with latest photoshoot credits
 */
async function getProfile(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        free_generations_used: user.free_generations_used,
        paid_credits: user.paid_credits,
        hasPurchased: user.hasPurchased,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  login,
  getProfile,
};
