require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("./src/config/db");
const Theme = require("./src/models/Theme");
const Generation = require("./src/models/Generation");
const admin = require("./src/config/firebase");

async function cleanup() {
  await connectDB();

  console.log("Cleaning up database collections...");

  // 1. Delete all Generations
  const genDeleteResult = await Generation.deleteMany({});
  console.log(`Deleted ${genDeleteResult.deletedCount} Generations from MongoDB.`);

  // 2. Delete all Themes
  const themeDeleteResult = await Theme.deleteMany({});
  console.log(`Deleted ${themeDeleteResult.deletedCount} Themes from MongoDB.`);

  // 3. Clean up Firebase Storage buckets if Firebase is initialized
  try {
    const bucket = admin.storage().bucket();
    
    // Delete files inside theme_gallery/ folder
    console.log("Cleaning up theme_gallery/ in Firebase Storage...");
    const [themeFiles] = await bucket.getFiles({ prefix: "theme_gallery/" });
    for (const file of themeFiles) {
      console.log(`Deleting file: ${file.name}`);
      await file.delete();
    }

    // Delete files inside generated_outputs/ folder
    console.log("Cleaning up generated_outputs/ in Firebase Storage...");
    const [outputFiles] = await bucket.getFiles({ prefix: "generated_outputs/" });
    for (const file of outputFiles) {
      console.log(`Deleting file: ${file.name}`);
      await file.delete();
    }
    
    console.log("Firebase Storage cleanup completed.");
  } catch (err) {
    console.error("Firebase Storage cleanup skipped or failed:", err.message);
  }

  await mongoose.disconnect();
  console.log("Cleanup script completed successfully.");
}

cleanup().catch(err => {
  console.error("Cleanup error:", err);
  process.exit(1);
});
