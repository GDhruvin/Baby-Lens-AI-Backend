require("dotenv").config();
const path = require("path");
const { validateAndCleanEnvironment } = require("./src/utils/envHelper");

// Validate environment variables and clean local proxy settings
validateAndCleanEnvironment();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const { rateLimit } = require("express-rate-limit");
const mongoose = require("mongoose");
const connectDB = require("./src/config/db");
const healthCheck = require("./src/utils/healthCheck");
const errorHandler = require("./src/utils/errorHandler");
const { makeGracefulShutdown } = require("./src/utils/shutdown");

// Connect to MongoDB
connectDB();

const app = express();

// Basic Middleware
app.use(helmet());
app.use(compression());
app.use(cors());

// Global API rate limiter - 15 minutes window, max 100 requests per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: "draft-7", // Use modern RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  message: {
    error_code: "TOO_MANY_REQUESTS",
    message: "Too many requests from this IP, please try again after 15 minutes",
  },
});
app.use("/api/", apiLimiter);

app.use(express.json({ limit: "10mb" })); // Enforce request body size limit to 10MB

// Set up EJS for rendering views
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use("/api/auth", require("./src/routes/user.routes"));
app.use("/api/baby-profiles", require("./src/routes/babyProfile.routes"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/themes", require("./src/routes/theme.routes"));
app.use("/api/generations", require("./src/routes/generation.routes"));
app.use("/api/payments", require("./src/routes/payment.routes"));

// Health Check Route with Active DB connectivity check
app.get("/", healthCheck);

// Centralized Global Error Handling Middleware (Must be registered last)
app.use(errorHandler);

// Define the port
const PORT = process.env.PORT || 3000;

// Start the server
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Server is running on port ${PORT} and accessible on all interfaces`,
  );
});

// Graceful Shutdown Handler
const gracefulShutdown = makeGracefulShutdown(server);

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
