require("dotenv").config();
const path = require("path");

// Fail-fast Environment Variable Validation on Startup
const requiredEnvVars = ["MONGODB_URI"];
const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (process.env.USE_GEMINI_API === "true") {
  if (!process.env.GCP_PROJECT_ID) {
    missingEnvVars.push("GCP_PROJECT_ID");
  }
}

if (missingEnvVars.length > 0) {
  console.error("❌ STARTUP ERROR: Missing required environment variables:");
  missingEnvVars.forEach((v) => console.error(`   - ${v}`));
  process.exit(1);
}

const express = require("express");
const cors = require("cors");
const connectDB = require("./src/config/db");

// Some local setups inject a dead proxy (127.0.0.1:9), which breaks Google OAuth token exchange.
// If that value is detected, disable proxy env vars for this process.
const proxyEnvKeys = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
];
for (const key of proxyEnvKeys) {
  const val = process.env[key];
  if (val && /127\.0\.0\.1:9/.test(val)) {
    delete process.env[key];
  }
}

// Ensure GOOGLE_APPLICATION_CREDENTIALS is an absolute path
if (
  process.env.GOOGLE_APPLICATION_CREDENTIALS &&
  !path.isAbsolute(process.env.GOOGLE_APPLICATION_CREDENTIALS)
) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(
    process.cwd(),
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
  );
}

// Connect to MongoDB
connectDB();

const app = express();

// Basic Middleware
app.use(cors());
app.use(express.json()); // Allows your app to parse JSON bodies

// Set up EJS for rendering views
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use("/api/auth", require("./src/routes/user.routes"));
app.use("/api/baby-profiles", require("./src/routes/babyProfile.routes"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/themes", require("./src/routes/theme.routes"));
app.use("/api/generations", require("./src/routes/generation.routes"));
app.use("/api/payments", require("./src/routes/payment.routes"));

// Simple Health Check Route
app.get("/", (req, res) => {
  res.status(200).json({ message: "AI Baby Photoshoot API is running!" });
});

// Centralized Global Error Handling Middleware (Must be registered last)
app.use((err, req, res, next) => {
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
});

// Define the port
const PORT = process.env.PORT || 3000;

// Start the server
app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Server is running on port ${PORT} and accessible on all interfaces`,
  );
});
