const userService = require("../services/user.service");

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
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  login,
};
