require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("./src/config/db");
const DeviceToken = require("./src/models/deviceToken.model");
const notificationService = require("./src/services/notification.service");

async function runTest() {
  await connectDB();

  console.log("\n==========================================");
  console.log("   BABYLENS PUSH NOTIFICATION TEST TOOL   ");
  console.log("==========================================\n");

  // 1. Fetch latest active device token from DB
  const latestTokenDoc = await DeviceToken.findOne({ is_active: true }).sort({ updated_at: -1 });

  if (!latestTokenDoc) {
    console.log("⚠️ No active device tokens found in the database yet!");
    console.log("👉 Please run the mobile app on your phone/emulator first so it registers a token.\n");
    process.exit(0);
  }

  console.log(`📱 Found registered device:`);
  console.log(`   - Device ID: ${latestTokenDoc.device_id}`);
  console.log(`   - Platform:  ${latestTokenDoc.platform}`);
  console.log(`   - Token:     ${latestTokenDoc.fcm_token.substring(0, 25)}...`);
  console.log(`   - User ID:   ${latestTokenDoc.user_id || "Guest (not logged in yet)"}\n`);

  console.log("🚀 Sending Test Notification (AI Photoshoot Ready)...");

  const result = await notificationService.sendToTokens([latestTokenDoc.fcm_token], {
    title: "✨ Your Baby Photoshoot is Ready! (Test)",
    body: 'The "Royal Prince" portrait is ready! Tap to view.',
    channelId: "photoshoot_status",
    data: {
      type: "GENERATION_COMPLETE",
      generation_id: "test_gen_123",
      theme_name: "Royal Prince",
    },
  });

  console.log("📬 FCM Response:", JSON.stringify(result, null, 2));

  if (result.successCount > 0) {
    console.log("\n🎉 SUCCESS! Notification dispatched to your device.");
    console.log("Check your phone/emulator screen or notification shade.\n");
  } else {
    console.log("\n❌ Failed to deliver. Error details above.\n");
  }

  process.exit(0);
}

runTest().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
