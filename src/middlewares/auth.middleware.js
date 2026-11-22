const userService = require("../services/user.service");
const User = require("../models/user.model");

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "gabanidhruvin30@gmail.com").toLowerCase().trim();

function checkIsAdmin(user) {
  if (!user) return false;
  const email = (user.email || "").toLowerCase().trim();
  return email === ADMIN_EMAIL || user.role === "admin";
}

exports.checkIsAdmin = checkIsAdmin;

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
    req.isAdmin = checkIsAdmin(user);
    
    next();
  } catch (error) {
    console.error("Auth Middleware Error:", error);
    return res.status(401).json({ message: "Authentication failed. Invalid or expired token." });
  }
};

/**
 * Optional Authentication Middleware
 * If a valid Bearer token is provided, attaches req.user and req.isAdmin.
 * Does NOT throw 401 if token is absent or invalid (falls back to unauthenticated public user).
 */
exports.optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const idToken = authHeader.split("Bearer ")[1];
      const decodedToken = await userService.verifyFirebaseToken(idToken);
      if (decodedToken && decodedToken.uid) {
        const user = await User.findOne({ auth_uid: decodedToken.uid });
        if (user) {
          req.user = user;
          req.isAdmin = checkIsAdmin(user);
        }
      }
    }
  } catch (error) {
    // Non-blocking: unauthenticated / public visitor
  }
  next();
};

