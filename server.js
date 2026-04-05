require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./src/config/db");

// Connect to MongoDB
connectDB();

const app = express();

// Basic Middleware
app.use(cors());
app.use(express.json()); // Allows your app to parse JSON bodies

app.use("/api/auth", require("./src/routes/authRoutes"));

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
