const mongoose = require("mongoose");

/**
 * Creates a graceful shutdown handler for the HTTP server
 * @param {object} server - Express server instance
 * @returns {function} The graceful shutdown handler function
 */
function makeGracefulShutdown(server) {
  return () => {
    console.log("Received kill signal, shutting down gracefully...");
    server.close(async () => {
      console.log("Express HTTP server closed.");
      try {
        await mongoose.connection.close();
        console.log("Mongoose connection closed.");
        process.exit(0);
      } catch (err) {
        console.error("Error closing Mongoose connection:", err);
        process.exit(1);
      }
    });

    // Force exit after 10 seconds if graceful shutdown is stuck
    setTimeout(() => {
      console.error("Could not close connections in time, forcefully shutting down");
      process.exit(1);
    }, 10000);
  };
}

module.exports = {
  makeGracefulShutdown,
};
