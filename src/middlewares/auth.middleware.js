const userService = require("../services/user.service");
const User = require("../models/user.model");

exports.requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authentication required missing token" });
    }

    const idToken = authHeader.split("Bearer ")[1];
    
    // Verify the Token with Firebase using the service
    const decodedToken = await userService.verifyFirebaseToken(idToken);

    // Find the user in our DB
    const user = await User.findOne({ auth_uid: decodedToken.uid });
    
    if (!user) {
       return res.status(401).json({ message: "User not found in database" });
    }

    // Attach user to request object so downstream routes/controllers can access it
    req.user = user;
    
    next();
  } catch (error) {
    console.error("Auth Middleware Error:", error);
    return res.status(401).json({ message: "Authentication failed. Invalid or expired token." });
  }
};
