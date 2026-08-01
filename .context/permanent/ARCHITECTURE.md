# Backend Permanent Context — Architecture & Data Flow

> **Why this exists:** Architecture blueprint for the BabyLens Express REST API, MongoDB data layer, Firebase Auth & Storage integrations, and Vertex AI generative pipeline.
> **Who should read it:** Engineers/AI working on backend routes, services, or model integrations.
> **Maintenance:** Update when service providers, database topologies, or architectural boundaries change.

---

## 1. System Overview & Service Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                      Express HTTP API                       │
│                     (Node.js 22 + Express 5)                │
└───────┬──────────────────────┬──────────────────────┬───────┘
        │                      │                      │
        ▼                      ▼                      ▼
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│   MongoDB    │       │ Firebase SDK │       │  Vertex AI   │
│  (Mongoose)  │       │ Auth+Storage │       │ (Gemini 2.5) │
└──────────────┘       └──────────────┘       └──────────────┘
```

The backend is structured into 4 strict layers:
1.  **Routes (`src/routes/`)**: Define path signatures, HTTP methods, authentication middleware, and input upload middleware (`multer`).
2.  **Controllers (`src/controllers/`)**: Parse request parameters, trigger services, and respond with HTTP JSON status codes. Errors are caught and delegated via `next(error)`.
3.  **Services (`src/services/`)**: Contain domain logic (Google Vertex AI prompt generation, Jimp watermark manipulation, storage downloads).
4.  **Models (`src/models/`)**: Define Mongoose schemas for MongoDB persistence.

---

## 2. Directory Layout (`/backend`)

*   `server.js`: Express app initialization, rate limiting (100 req/15min), body parsers (10MB limit), and route mounting.
*   `src/config/`: `db.js` (MongoDB connection) and `firebase.js` (Firebase Admin SDK).
*   `src/models/`: `user.model.js`, `babyProfile.model.js`, `generation.model.js`, `theme.model.js`, `themeCategory.model.js`, `device.model.js`, `purchase.model.js`.
*   `src/controllers/`: `user.controller.js`, `babyProfile.controller.js`, `generation.controller.js`, `theme.controller.js`, `payment.controller.js`.
*   `src/routes/`: `user.routes.js`, `babyProfile.routes.js`, `generation.routes.js`, `theme.routes.js`, `payment.routes.js`.
*   `src/services/`: `generation.service.js`, `babyProfile.service.js`, `theme.service.js`, `user.service.js`, `watermark.service.js`.
*   `src/middlewares/`: `auth.middleware.js` (Firebase ID Token verification), `logger.middleware.js`.
*   `src/utils/`: `envHelper.js`, `errorHandler.js`, `healthCheck.js`, `shutdown.js`, `storageUtils.js`.

---

## 3. Data & Execution Flows

### 3.1 Baby Profile Extraction Pipeline
1. Client uploads reference photo to `POST /api/baby-profiles`.
2. Backend uploads photo buffer to Firebase Storage (`baby_profiles/{userId}/{timestamp}.jpg`).
3. Photo buffer is sent to Google Vertex AI (`gemini-2.5-flash`) with facial identity extraction system prompt.
4. Gemini returns structured identity JSON (`age_range`, `gender`, `face_lock`, `skin_tone`, `texture_lock`, `expression_lock`).
5. Document saved to MongoDB `BabyProfile` model and returned to client.

### 3.2 Photoshoot Generation Pipeline
1. Client calls `POST /api/generations/create` with `profile_id` and `theme_id`.
2. `generationService` validates credit balance and interpolates `identity_json` into `Theme.prompt_template`.
3. Calls Google Vertex AI (`gemini-2.5-flash-image` / Imagen) to render output image.
4. Image buffer saved to Firebase Storage (`generated_outputs/{userId}/{timestamp}.png`).
5. `Generation` document created in MongoDB (`is_unlocked: false`), credits decremented.

### 3.3 Dynamic Image Watermarking
1. Client calls `GET /api/generations/photo/:id`.
2. If `generation.is_unlocked === false`, `watermark.service.js` uses Jimp to overlay brand watermark onto original buffer in memory before streaming.
3. If `is_unlocked === true`, pristine original JPEG is streamed directly.
