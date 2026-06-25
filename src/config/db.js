const mongoose = require("mongoose");

// Monitor Mongoose connection events for production observability
mongoose.connection.on("connected", () => {
  console.log("Mongoose connection established to database");
});

mongoose.connection.on("error", (err) => {
  console.error(`Mongoose connection error: ${err.message}`);
});

mongoose.connection.on("disconnected", () => {
  console.warn("Mongoose connection disconnected from database");
});

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connection Handshake Successful: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Database Connection Error: ${error.message}`);
    process.exit(1); // Exit the process if it fails to connect
  }
};

module.exports = connectDB;
