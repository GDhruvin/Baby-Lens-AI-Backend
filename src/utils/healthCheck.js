const mongoose = require("mongoose");

/**
 * Health check route handler verifying active database connectivity
 */
function healthCheck(req, res) {
  const dbConnected = mongoose.connection.readyState === 1;
  if (!dbConnected) {
    return res.status(503).json({
      status: "unhealthy",
      message: "Database connection is inactive",
      database: "disconnected",
    });
  }

  res.status(200).json({
    status: "healthy",
    message: "AI Baby Photoshoot API is running!",
    database: "connected",
  });
}

module.exports = healthCheck;
