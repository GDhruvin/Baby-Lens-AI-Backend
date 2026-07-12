const path = require("path");

/**
 * Validates required environment variables, ensures credential paths are absolute,
 * and purges local development proxy residues.
 */
function validateAndCleanEnvironment() {
  // 1. Fail-fast Environment Variable Validation
  const requiredEnvVars = ["MONGODB_URI"];
  const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName]);

  if (process.env.USE_GEMINI_API === "true" && !process.env.GCP_PROJECT_ID) {
    missingEnvVars.push("GCP_PROJECT_ID");
  }

  if (missingEnvVars.length > 0) {
    console.error("❌ STARTUP ERROR: Missing required environment variables:");
    missingEnvVars.forEach((v) => console.error(`   - ${v}`));
    process.exit(1);
  }

  // 2. Ensure GOOGLE_APPLICATION_CREDENTIALS is an absolute path
  if (
    process.env.GOOGLE_APPLICATION_CREDENTIALS &&
    !path.isAbsolute(process.env.GOOGLE_APPLICATION_CREDENTIALS)
  ) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(
      process.cwd(),
      process.env.GOOGLE_APPLICATION_CREDENTIALS
    );
  }

  // 3. Clean up dead proxies injected by local setups (e.g. 127.0.0.1:9)
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
}

module.exports = {
  validateAndCleanEnvironment,
};
