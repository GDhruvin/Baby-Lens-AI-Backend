# BabyLens — Backend Context Engineering Document

> **Purpose:** This is the single source of truth for any human or AI agent working on the
> BabyLens backend. Read this file **before** writing a single line of code.
> It contains architecture decisions, coding standards, security protocols, and
> production-readiness rules that must never be violated.

---

## 1 · Product Overview

BabyLens is a **public-facing, consumer-grade AI baby photoshoot application** that will
serve **hundreds of thousands of users** in production. Users upload a baby photo, the
backend extracts facial identity attributes via Google Vertex AI (Gemini), and then
generates AI-themed photoshoot images while preserving the baby's identity.

### Core Business Flow

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────────┐
│ Mobile App  │────▶│  Backend API │────▶│ Google Vertex AI      │
│ (React      │     │  (Express +  │     │ (Gemini 2.5 Flash)    │
│  Native)    │◀────│  MongoDB)    │◀────│                       │
└─────────────┘     └──────────────┘     └──────────────────────┘
                          │
                          ▼
                    ┌──────────────┐
                    │ Firebase     │
                    │ Auth +       │
                    │ Storage      │
                    └──────────────┘
```

---

## 2 · Technology Stack

| Layer            | Technology                           | Version / Notes                      |
|------------------|--------------------------------------|--------------------------------------|
| Runtime          | Node.js                              | ≥ 22.11.0                            |
| Framework        | Express.js                           | v5.2.x                               |
| Database         | MongoDB via Mongoose                 | v9.3.x                               |
| Authentication   | Firebase Admin SDK                   | v13.7.x (ID token verification)      |
| AI / ML          | Google Vertex AI via `@google/genai` | v1.50.x (Gemini 2.5 Flash)           |
| File Storage     | Firebase Cloud Storage               | Via `firebase-admin`                  |
| File Upload      | Multer (memory storage)              | v2.1.x                               |
| View Engine      | EJS                                  | v5.0.x (admin theme pages only)      |
| Env Management   | dotenv                               | v17.3.x                              |
| Dev Tool         | Nodemon                              | v3.1.x                               |

---

## 3 · Project Structure

```
backend/
├── server.js                          # Entry point — Express app bootstrap
├── package.json
├── .env                               # Environment variables (NEVER commit to repo)
├── .gitignore
├── gen-lang-client-*.json             # GCP service account key (NEVER commit)
│
├── src/
│   ├── config/
│   │   ├── db.js                      # MongoDB connection (mongoose.connect)
│   │   ├── firebase.js                # Firebase Admin SDK initialization
│   │   └── firebase-service-account.json  # ⚠ SECRET — must be in .gitignore
│   │
│   ├── models/                        # Mongoose schemas
│   │   ├── User.js                    # auth_uid, name, email, credits
│   │   ├── BabyProfile.js            # user_id → ref image + identity_json
│   │   ├── Generation.js             # user_id + profile + theme → output
│   │   ├── Theme.js                   # label, category_id, prompt_template
│   │   ├── ThemeCategory.js           # name, slug, sort_order
│   │   └── Device.js                  # device_id → linked_users (abuse prevention)
│   │
│   ├── controllers/                   # Business logic, grouped by domain
│   │   ├── auth/
│   │   │   └── login.js              # Firebase token verify → find/create user
│   │   ├── babyProfile/
│   │   │   ├── analyze.js            # Upload image → Gemini identity extraction
│   │   │   ├── list.js               # GET user's baby profiles
│   │   │   ├── update.js             # PATCH profile fields
│   │   │   ├── delete.js             # DELETE profile + Firebase Storage cleanup
│   │   │   └── utils.js              # Gemini prompt, validation, storage helpers
│   │   ├── generation/
│   │   │   ├── create.js             # Theme + profile → AI image generation
│   │   │   ├── list.js               # GET uploaded images
│   │   │   ├── myPhotos.js           # GET user's generated photos
│   │   │   └── utils.js              # Prompt builder, image extraction, upload
│   │   └── theme/
│   │       ├── create.js             # Admin: create theme with image
│   │       ├── getAll.js             # GET all themes (grouped by category)
│   │       ├── getSingle.js          # GET single theme
│   │       ├── update.js             # PUT theme
│   │       ├── delete.js             # DELETE theme
│   │       ├── render.js             # EJS admin page
│   │       └── utils.js              # Theme validation helpers
│   │
│   ├── middlewares/
│   │   └── authMiddleware.js          # requireAuth: verify Firebase token, attach req.user
│   │
│   ├── routes/                        # Express route definitions
│   │   ├── authRoutes.js              # POST /api/auth/login
│   │   ├── babyProfileRoutes.js       # /api/baby-profiles/*
│   │   ├── generationRoutes.js        # /api/generations/*
│   │   └── themeRoutes.js             # /api/themes/*
│   │
│   ├── services/                      # (Reserved) External service wrappers
│   └── utils/                         # (Reserved) Shared utility functions
│
├── uploads/                           # Local upload temp directory
└── views/                             # EJS templates (admin)
```

---

## 4 · Architecture Rules & Patterns

### 4.1 — Module Pattern (CommonJS)

This project uses `require()` / `module.exports` — **NOT** ES Modules (`import`/`export`).
**Do NOT** mix module systems or add `"type": "module"` to `package.json`.

```js
// ✅ CORRECT
const express = require('express');
module.exports = router;

// ❌ WRONG
import express from 'express';
export default router;
```

### 4.2 — Controller Pattern

Every controller is a **single-responsibility async function** exported from its own file:

```js
// ✅ One controller per file
// src/controllers/auth/login.js
module.exports = async (req, res) => {
  try {
    // ... business logic
    return res.status(200).json({ message: 'Success', data });
  } catch (error) {
    console.error('Controller Error:', error);
    return res.status(500).json({ message: 'Failed', error: error.message });
  }
};
```

**Rules:**
- Always wrap in `try/catch`.
- Always return `res.status(xxx).json({...})` — never leave hanging responses.
- Use structured error codes: `{ error_code: 'SNAKE_UPPER_CASE', message: '...' }`.
- Group related controllers in a subdirectory (e.g., `controllers/generation/`).
- Extract reusable logic to a `utils.js` within the same controller group.

### 4.3 — Route Pattern

Routes are thin — they only define HTTP method, path, middleware chain, and controller:

```js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/authMiddleware');
const create = require('../controllers/generation/create');

router.post('/create', requireAuth, create);

module.exports = router;
```

**Rules:**
- No business logic in route files.
- Apply `requireAuth` to every route that needs authentication.
- Multer config lives in the route file (close to where it's consumed).
- Each route file is mounted in `server.js` under its API prefix.

### 4.4 — Model Pattern (Mongoose)

```js
const mongoose = require('mongoose');

const exampleSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

module.exports = mongoose.model('Example', exampleSchema);
```

**Rules:**
- Use `snake_case` for all field names (e.g., `user_id`, `created_at`).
- Timestamps: always use `{ createdAt: 'created_at', updatedAt: 'updated_at' }`.
- Add `index: true` on fields used for querying (e.g., `auth_uid`, `device_id`).
- Use `ref: 'ModelName'` for ObjectId relationships.
- Add validation constraints (`required`, `trim`, `minlength`, `maxlength`, `enum`).

### 4.5 — Middleware Pattern

```js
exports.requireAuth = async (req, res, next) => {
  try {
    // 1. Extract token from Authorization header
    // 2. Verify with Firebase Admin
    // 3. Find user in DB
    // 4. Attach to req.user
    // 5. Call next()
  } catch (error) {
    return res.status(401).json({ message: 'Authentication failed' });
  }
};
```

**Rules:**
- Always call `next()` on success, or return a response on failure.
- Never call both `next()` and `res.json()` in the same path.
- Log errors with `console.error()` including the middleware name.

---

## 5 · API Conventions

### 5.1 — Base URL Structure

```
/api/{resource-group}/{action}

Examples:
  POST   /api/auth/login
  POST   /api/baby-profiles/analyze
  GET    /api/baby-profiles/my-list
  DELETE /api/baby-profiles/:id
  POST   /api/generations/create
  GET    /api/generations/my-photos
  GET    /api/themes
  POST   /api/themes/create
```

### 5.2 — Request/Response Contract

**All responses** follow this shape:

```js
// Success
{
  "message": "Human-readable success message",
  // ... domain-specific fields (profile_id, image_url, etc.)
}

// Error
{
  "error_code": "SNAKE_UPPER_CASE_ERROR_CODE",  // Machine-readable
  "message": "Human-readable error description"
}
```

### 5.3 — HTTP Status Code Usage

| Code | Meaning                            | When to Use                                      |
|------|------------------------------------|--------------------------------------------------|
| 200  | Success                            | Successful GET, POST, PUT, PATCH                 |
| 201  | Created                            | Resource created (optional, 200 also acceptable)  |
| 400  | Bad Request                        | Validation errors, missing fields, bad IDs       |
| 401  | Unauthorized                       | Missing/invalid/expired Firebase token           |
| 403  | Forbidden                          | Valid token but insufficient permissions          |
| 404  | Not Found                          | Resource doesn't exist or is inactive            |
| 429  | Too Many Requests                  | Vertex AI quota exceeded                         |
| 500  | Internal Server Error              | Unexpected server errors                         |
| 504  | Gateway Timeout                    | External API (Gemini) timed out                  |

### 5.4 — Authentication Flow

```
Mobile App                    Backend                     Firebase
   │                            │                            │
   │  1. GoogleSignIn.signIn()  │                            │
   │ ──────────────────────────▶│                            │
   │                            │  2. verifyIdToken(token)   │
   │                            │ ──────────────────────────▶│
   │                            │  3. decodedToken (uid)     │
   │                            │ ◀──────────────────────────│
   │                            │                            │
   │                            │  4. findOrCreate User in MongoDB
   │                            │  5. Handle Device fingerprinting
   │                            │                            │
   │  6. { user: {...} }        │                            │
   │ ◀──────────────────────────│                            │
```

**All authenticated endpoints** must use:
- Header: `Authorization: Bearer <firebase_id_token>`
- Middleware: `requireAuth` (verifies token, attaches `req.user`)

---

## 6 · Environment Variables

```env
# ── Server ─────────────────────────────────────────────────
PORT=3000

# ── Database ───────────────────────────────────────────────
MONGODB_URI=mongodb://127.0.0.1:27017/babylens-backend

# ── Firebase ───────────────────────────────────────────────
FIREBASE_STORAGE_BUCKET=gs://your-project.firebasestorage.app

# ── Vertex AI / Gemini ─────────────────────────────────────
USE_GEMINI_API=true                    # false = mock mode (no real AI calls)
GCP_PROJECT_ID=your-gcp-project-id
GCP_LOCATION=us-central1              # For Gemini Flash text model
VERTEX_MODEL=gemini-2.5-flash         # Identity extraction model
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image  # Image generation model
GCP_IMAGE_LOCATION=global             # For image generation model

# ── Generation Tuning ──────────────────────────────────────
GENERATION_MAX_ATTEMPTS=6             # Max retry attempts for image generation
GENERATION_EXTERNAL_REQUEST_TIMEOUT_MS=60000
GENERATION_RETRY_DELAY_MIN_MS=2000
GENERATION_RETRY_DELAY_MAX_MS=5000
GENERATION_MAX_429_RETRIES=1          # Max retries on quota exhaustion

# ── Optional ───────────────────────────────────────────────
# GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
```

**Rules:**
- **NEVER** hardcode secrets, API keys, or credentials in source code.
- **NEVER** commit `.env` or service account JSON files to version control.
- All env vars should have sensible defaults in code via `process.env.X || 'default'`.
- Use `USE_GEMINI_API=false` for local development without billing charges.

---

## 7 · Security Standards (Production-Grade)

### 7.1 — Authentication & Authorization

- **EVERY** user-facing endpoint must use `requireAuth` middleware.
- Verify Firebase ID tokens server-side — never trust client claims.
- Always check resource ownership: `if (String(resource.user_id) !== String(req.user.id))`.
- Never expose internal IDs or stack traces in production error responses.

### 7.2 — Input Validation

```js
// ✅ Always validate before processing
if (!profile_id || !theme_id) {
  return res.status(400).json({
    error_code: 'MISSING_PROFILE_OR_THEME_ID',
    message: 'profile_id and theme_id are required',
  });
}

// ✅ Validate ObjectId format
if (!mongoose.Types.ObjectId.isValid(profile_id)) {
  return res.status(400).json({
    error_code: 'INVALID_PROFILE_OR_THEME_ID',
    message: 'profile_id must be a valid id',
  });
}
```

**Rules:**
- Validate ALL request inputs before any database or external API call.
- Use Mongoose schema validation as a second layer of defense.
- Sanitize filenames before storage: `file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')`.
- Enforce file size limits via Multer: `limits: { fileSize: 5 * 1024 * 1024 }`.
- Filter allowed MIME types: `['image/jpeg', 'image/jpg', 'image/png', 'image/webp']`.

### 7.3 — Rate Limiting & Abuse Prevention

- Device fingerprinting via `Device` model tracks users per physical device.
- Credit system (`free_generations_used`, `paid_credits`) limits AI generation abuse.
- Respect Gemini 429 responses — implement exponential backoff with jitter.
- **TODO for production:** Add express-rate-limit middleware on all endpoints.

### 7.4 — Data Privacy

- Baby images are sensitive personal data — store in Firebase Storage with signed URLs.
- Never log image data (base64) or full URLs in production.
- Implement proper cleanup: when a profile is deleted, remove its Firebase Storage image.
- Signed URLs have expiration — never store signed URLs long-term.

---

## 8 · Error Handling Standards

### 8.1 — Controller Error Pattern

```js
module.exports = async (req, res) => {
  try {
    // Business logic...
  } catch (error) {
    console.error('ControllerName Error:', error);

    // Handle known error types specifically
    if (error?.status === 429) {
      return res.status(429).json({
        error_code: 'QUOTA_EXCEEDED',
        message: 'Service quota exhausted. Please retry later.',
      });
    }

    if (error?.name === 'AbortError') {
      return res.status(504).json({
        error_code: 'TIMEOUT',
        message: 'External service timed out',
      });
    }

    // Generic fallback
    return res.status(500).json({
      message: 'An unexpected error occurred',
      error: error.message,
    });
  }
};
```

### 8.2 — Error Code Registry

| Error Code                         | HTTP | Description                                 |
|------------------------------------|------|---------------------------------------------|
| `MISSING_PROFILE_OR_THEME_ID`     | 400  | Required IDs not provided                   |
| `INVALID_PROFILE_OR_THEME_ID`     | 400  | IDs are not valid MongoDB ObjectIds         |
| `INVALID_PROFILE_IDENTITY`        | 400  | Profile has no valid face data              |
| `REFERENCE_IMAGE_UNREADABLE`      | 400  | Cannot fetch reference image from storage   |
| `IMAGE_MODEL_NOT_FOUND_OR_NO_ACCESS` | 400 | Gemini model unavailable/misconfigured    |
| `PROFILE_NOT_FOUND`               | 404  | Baby profile doesn't exist                  |
| `THEME_NOT_FOUND_OR_INACTIVE`     | 404  | Theme doesn't exist or is deactivated       |
| `PROFILE_NOT_OWNED_BY_USER`       | 403  | User trying to access another user's data   |
| `GENERATION_QUOTA_EXCEEDED`       | 429  | Gemini API quota exhausted                  |
| `GENERATION_TIMEOUT`              | 504  | Image generation took too long              |
| `REFERENCE_IMAGE_FETCH_TIMEOUT`   | 504  | Reference image download timed out          |

---

## 9 · AI / Gemini Integration Standards

### 9.1 — Identity Extraction (Baby Profile Analysis)

- Model: `gemini-2.5-flash` via Vertex AI
- Input: Baby image (base64) + structured system prompt
- Output: JSON with keys: `age_range`, `gender`, `face_lock`, `skin_tone`, `texture_lock`, `expression_lock`
- Config: `temperature: 0.2`, `topP: 0.8`, `responseMimeType: 'application/json'`
- Always validate output with `validateBabyFaceDetected()` before saving.

### 9.2 — Image Generation

- Model: `gemini-2.5-flash-image` via `@google/genai`
- Input: Final prompt (theme template + identity JSON) + reference image (base64)
- Output: Generated image in response parts
- Config: `responseModalities: ['IMAGE', 'TEXT']`, `aspectRatio: '4:5'`
- Retry logic: up to `GENERATION_MAX_ATTEMPTS` with random jitter delay.
- Timeout: `GENERATION_EXTERNAL_REQUEST_TIMEOUT_MS` (default 60s).

### 9.3 — Mock Mode

When `USE_GEMINI_API=false`:
- All AI calls return hardcoded mock data.
- No billing charges incurred.
- Use for local development and testing.
- Mock generation creates a DB record with `output_image_url: null`.

### 9.4 — Prompt Engineering Rules

- Theme `prompt_template` may contain `{{identity_json}}` placeholder.
- If placeholder exists → replace with JSON identity block.
- If no placeholder → append identity block with "Hard rules" section.
- Never modify the identity extraction system prompt without thorough testing.
- Prompt templates are stored in MongoDB (admin-managed).

---

## 10 · Firebase Storage Standards

### 10.1 — File Path Conventions

```
baby_profiles/{user_id}/{timestamp}_{sanitized_filename}
generated_outputs/{user_id}/{timestamp}_{index}_{random}.{ext}
theme_images/{timestamp}_{sanitized_filename}
```

### 10.2 — URL Types

| Type              | Format                                              | Usage                        |
|-------------------|-----------------------------------------------------|------------------------------|
| Storage Object URL | `https://firebasestorage.googleapis.com/v0/b/...`  | Stored in DB (persistent)    |
| Download URL      | Storage URL + `?token=...`                          | Returned in API responses    |
| Signed URL        | URL + `X-Goog-Signature` params                     | Temporary access             |

**Rules:**
- Store **Storage Object URLs** in the database (without tokens).
- Generate download/signed URLs at read time via `getDownloadURL()`.
- Always use `toSignedStorageUrl()` to normalize URLs before fetching images.

---

## 11 · Database Standards

### 11.1 — Naming Conventions

- Collection names: PascalCase singular (`User`, `BabyProfile`, `Generation`)
- Field names: `snake_case` (`user_id`, `created_at`, `identity_json`)
- Timestamps: `created_at`, `updated_at` (mapped via Mongoose timestamps option)

### 11.2 — Relationships

```
User (1) ──▶ (N) BabyProfile
User (1) ──▶ (N) Generation
BabyProfile (1) ──▶ (N) Generation
ThemeCategory (1) ──▶ (N) Theme
Device (N) ──▶ (N) User (via linked_users array)
```

### 11.3 — Indexing Strategy

- `User.auth_uid` — unique index (primary lookup for auth)
- `Device.device_id` — unique index (abuse prevention lookup)
- Add compound indexes for frequent query patterns (e.g., `{ user_id: 1, created_at: -1 }`)
- **TODO for production:** Add proper indexes on `Generation.user_id`, `BabyProfile.user_id`

---

## 12 · Coding Standards

### 12.1 — Naming Conventions

| Element        | Convention                         | Example                           |
|----------------|------------------------------------|-----------------------------------|
| Variables      | camelCase                          | `imageUrl`, `userId`              |
| Functions      | camelCase                          | `buildFinalPrompt()`, `signCloudPath()` |
| Constants      | UPPER_SNAKE_CASE                   | `MAX_GENERATION_ATTEMPTS`         |
| Files          | camelCase.js                       | `authMiddleware.js`, `login.js`   |
| Directories    | camelCase                          | `babyProfile/`, `generation/`     |
| DB Fields      | snake_case                         | `user_id`, `identity_json`        |
| Error Codes    | UPPER_SNAKE_CASE                   | `PROFILE_NOT_FOUND`               |
| HTTP Headers   | Standard casing                    | `Authorization`, `Content-Type`   |

### 12.2 — Code Style Rules

- **Indentation:** 2 spaces (no tabs).
- **Semicolons:** Required.
- **Quotes:** Double quotes for strings (`"string"`).
- **Trailing commas:** Use where valid (arrays, objects).
- **Line length:** Soft limit 100 chars, hard limit 120 chars.
- **Blank lines:** One blank line between logical sections, two between top-level blocks.
- **Comments:** Use `//` for inline, block comments with `//` per line (no `/* */` blocks in logic).

### 12.3 — Comment Standards

```js
// ✅ Section headers (use in controllers for logical blocks)
// ==================================================
// VALIDATION
// ==================================================

// ✅ Inline explanation (non-obvious logic only)
// getIdToken() uses cached token, refreshes only when expired
const token = await getIdToken(currentUser);

// ❌ Don't state the obvious
// Set port to 3000
const PORT = 3000;
```

### 12.4 — Async/Await Rules

- Always use `async/await` — never raw Promises with `.then()`.
- Always wrap in `try/catch` at the controller level.
- Use `Promise.all()` for independent concurrent operations.
- Use `Promise.race()` for timeout patterns.
- Clean up resources in `finally` blocks (e.g., `clearTimeout`).

```js
// ✅ Concurrent independent calls
const [profile, theme] = await Promise.all([
  BabyProfile.findById(profile_id),
  Theme.findById(theme_id),
]);

// ✅ Timeout pattern
const result = await Promise.race([requestPromise, timeoutPromise]);
```

### 12.5 — Logging Standards

```js
// ✅ Structured step logging
console.log('1. Uploading baby image to Firebase Storage...');
console.log('2. REAL MODE → Vertex AI analyzing...');
console.log('3. Saving Baby Profile to MongoDB...');

// ✅ Error logging with context
console.error('Auth Middleware Error:', error);
console.error('Generate image error:', error);

// ✅ Warning for non-fatal issues
console.warn('[HTTP] 401 Unauthorized — token may be expired');

// ❌ Never log sensitive data
console.log('Token:', token);          // WRONG
console.log('Image base64:', base64);  // WRONG
```

---

## 13 · Performance & Scalability Rules

### 13.1 — Memory Management

- Multer uses `memoryStorage()` — file buffers live in RAM.
- Enforce strict file size limits (5MB for profiles, 10MB for themes).
- Process and upload files immediately, then let buffers be garbage collected.
- Never accumulate multiple large buffers in a single request.

### 13.2 — External API Resilience

- Always set timeouts on external calls (Gemini, Firebase Storage).
- Implement retry logic with exponential backoff and jitter for rate-limited APIs.
- Use `AbortController` for cancellable fetch operations.
- Cap max retries to prevent infinite loops.

### 13.3 — Database Performance

- Use `lean()` on Mongoose queries when you don't need Mongoose document methods.
- Select only needed fields: `Model.find({}).select('field1 field2')`.
- Use pagination for list endpoints.
- Never use `find()` without filters in production.
- Add indexes for frequently queried fields.

### 13.4 — Production Checklist (TODO)

- [ ] Add `express-rate-limit` on all endpoints
- [ ] Add `helmet` for security headers
- [ ] Add `compression` middleware
- [ ] Add request body size limit (beyond Multer)
- [ ] Add structured logging (Winston/Pino) instead of `console.log`
- [ ] Add health check endpoint with DB connectivity check
- [ ] Add graceful shutdown handling
- [ ] Add MongoDB connection pooling configuration
- [ ] Add API response caching for themes (rarely change)
- [ ] Add request ID tracking for distributed tracing

---

## 14 · Testing Standards

### 14.1 — Test Strategy

- Unit tests for utility functions (validators, prompt builders, URL normalizers).
- Integration tests for API endpoints (use supertest + in-memory MongoDB).
- Mock all external services (Gemini, Firebase) in tests.
- Test both success and error paths.

### 14.2 — Test File Naming

```
src/controllers/generation/__tests__/create.test.js
src/controllers/generation/__tests__/utils.test.js
src/middlewares/__tests__/authMiddleware.test.js
```

---

## 15 · Git & Version Control Rules

- **NEVER** commit: `.env`, `*.json` service account files, `node_modules/`, `uploads/`
- Commit message format: `type(scope): description`
  - Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`
  - Example: `feat(generation): add retry logic for 429 errors`
- One feature per branch, one logical change per commit.
- Review all diffs before committing — no debug logs, no commented-out code.

---

## 16 · Dependency Rules

- **Do NOT** add new dependencies without justification and team review.
- Prefer Node.js built-ins over npm packages (e.g., `crypto`, `path`, `url`).
- Pin exact versions for critical dependencies.
- Run `npm audit` regularly and fix vulnerabilities.
- Keep `devDependencies` separate — never ship dev tools to production.

---

## 17 · Common Pitfalls & Gotchas

### 17.1 — Proxy Environment Variables
The `server.js` entry point strips proxy env vars matching `127.0.0.1:9` because some local
setups inject a dead proxy that breaks Google OAuth token exchange. Do not remove this code.

### 17.2 — GOOGLE_APPLICATION_CREDENTIALS Path
Must be resolved to an absolute path. The `server.js` handles this, but if you add new
service account usage, ensure the path is absolute.

### 17.3 — Firebase Storage URL Normalization
Firebase Storage returns different URL formats. Always use `toSignedStorageUrl()` to
normalize before fetching image data. Store `storageObjectUrl` format in DB.

### 17.4 — Gemini Image Generation Non-Determinism
The Gemini image model may not always return an image — it can return text-only responses.
The retry loop in `collectTargetGeneratedImage()` handles this. Never assume first attempt
will succeed.

### 17.5 — Express 5 Breaking Changes
This project uses Express v5 which has breaking changes from v4:
- Route parameters use new syntax
- Error handling middleware may behave differently
- `res.json()` and other methods may have subtle differences

---

## 18 · AI Agent Instructions

When working on this codebase as an AI coding assistant:

1. **Read this entire file** before making any changes.
2. **Follow all patterns exactly** — do not introduce new patterns without explicit approval.
3. **Use CommonJS** (`require`/`module.exports`) — not ES Modules.
4. **Use snake_case for DB fields**, camelCase for JavaScript variables.
5. **Always add `requireAuth`** to new authenticated endpoints.
6. **Always validate inputs** before processing.
7. **Always handle errors** with try/catch and structured error codes.
8. **Never hardcode secrets** — use environment variables.
9. **Never log sensitive data** (tokens, images, personal info).
10. **Test with mock mode** (`USE_GEMINI_API=false`) to avoid billing.
11. **Add TODO comments** for production improvements, prefixed with `// TODO:`.
12. **Keep controllers single-purpose** — one action per file.
13. **Keep route files thin** — no business logic.
14. **Use `Promise.all`** for independent concurrent database calls.
15. **Add indexes** for new query patterns.

---

*Last updated: 2026-06-07*
*Maintainer: BabyLens Engineering Team*
