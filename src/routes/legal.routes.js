const express = require("express");
const router = express.Router();
const path = require("path");

const publicDir = path.join(__dirname, "../../public");

// Privacy Policy routes
router.get(["/privacy-policy", "/legal/privacy", "/PRIVACY_POLICY.html"], (req, res) => {
  res.sendFile(path.join(publicDir, "privacy-policy.html"));
});

// Terms of Service routes
router.get(["/terms-of-service", "/legal/terms", "/TERMS_OF_SERVICE.html"], (req, res) => {
  res.sendFile(path.join(publicDir, "terms-of-service.html"));
});

// Account Deletion routes
router.get(["/delete-account", "/account-deletion", "/legal/delete-account", "/ACCOUNT_DELETION.html"], (req, res) => {
  res.sendFile(path.join(publicDir, "delete-account.html"));
});

module.exports = router;
