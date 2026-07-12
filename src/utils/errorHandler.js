/**
 * Centralized Global Error Handling Middleware (registered last in Express application stack)
 */
function errorHandler(err, req, res, next) {
  console.error("Global Error Handler caught an exception:", err);

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
