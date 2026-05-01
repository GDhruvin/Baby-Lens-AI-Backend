require("dotenv").config();
const path = require('path');

// Some local setups inject a dead proxy (127.0.0.1:9), which breaks Google OAuth token exchange.
// If that value is detected, disable proxy env vars for this process.
const proxyEnvKeys = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'];
for (const key of proxyEnvKeys) {
  const val = process.env[key];
  if (val && /127\.0\.0\.1:9/.test(val)) {
    delete process.env[key];
  }
}

// Ensure GOOGLE_APPLICATION_CREDENTIALS is an absolute path
if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !path.isAbsolute(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

const express = require("express");
const cors = require("cors");
const connectDB = require("./src/config/db");

// Connect to MongoDB
connectDB();

const app = express();

// Basic Middleware
app.use(cors());
app.use(express.json()); // Allows your app to parse JSON bodies

// Set up EJS for rendering views
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use("/api/auth", require("./src/routes/authRoutes"));
app.use("/api/baby-profiles", require("./src/routes/babyProfileRoutes"));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use("/api/themes", require("./src/routes/themeRoutes"));


// Simple Health Check Route
app.get("/", (req, res) => {
  res.status(200).json({ message: "AI Baby Photoshoot API is running!" });
});

// Define the port
const PORT = process.env.PORT || 3000;

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
