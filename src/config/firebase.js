const admin = require("firebase-admin");

// 1. Import your secure service account key
// NOTE: You MUST have the firebase-service-account.json file in this same folder
const serviceAccount = require("./firebase-service-account.json");

// 2. Initialize the Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

console.log("Firebase Admin Initialized successfully");

module.exports = admin;
