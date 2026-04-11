require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./src/config/db");
const path = require('path');

// Connect to MongoDB
connectDB();

const app = express();

// Basic Middleware
app.use(cors());
app.use(express.json()); // Allows your app to parse JSON bodies

app.use("/api/auth", require("./src/routes/authRoutes"));
app.use("/api/baby-profiles", require("./src/routes/babyProfileRoutes"));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
