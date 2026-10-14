/**
 * Centralized Global Error Handling Middleware (registered last in Express application stack)
 */
function errorHandler(err, req, res, next) {
  console.error("Global Error Handler caught an exception:", err);

  // Specific handling for Multer file upload errors
  if (err.name === "MulterError") {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error_code: "FILE_TOO_LARGE",
        message: "Image file size exceeds the allowed limit (max 20MB). Please select a smaller photo.",
      });
    }
    return res.status(400).json({
      error_code: err.code || "UPLOAD_ERROR",
      message: err.message || "Failed to process uploaded file",
    });
  }

  const status = err.status || 500;
  const response = {
    message: err.message || "An unexpected error occurred",
  };

  if (err.code) {
    response.error_code = err.code;
  }

  // Include any extra details (such as image unreadable meta) if present
  if (err.details) {
    Object.assign(response, err.details);
  }

  return res.status(status).json(response);
}

module.exports = errorHandler;
