# Backend Permanent Context — Technology Stack & Dependencies

> **Why this exists:** Authoritative technical specification for backend runtimes, libraries, database drivers, and environment variables.
> **Who should read it:** Engineers/AI adding backend dependencies or modifying environment configurations.
> **Maintenance:** Update when backend dependencies or Node/Mongoose versions change.

---

## 1. Backend Technology Stack

| Component | Technology | Version | Usage / Notes |
| :--- | :--- | :--- | :--- |
| **Runtime** | Node.js | `>= 22.11.0` | CommonJS module system (`require`/`module.exports`). |
| **Framework** | Express.js | `v5.2.1` | HTTP web server in [server.js](file:///d:/program/BabyLens/backend/server.js). |
| **Database** | MongoDB / Mongoose | `v9.3.0` | Object Data Modeling (ODM). |
| **Auth Provider** | Firebase Admin SDK | `v13.7.0` | ID token verification (`auth.middleware.js`). |
| **AI / Generative** | Google Vertex AI | `@google/genai v1.50.0` | Gemini 2.5 Flash & Imagen on GCP. |
| **Storage** | Firebase Cloud Storage | Via `firebase-admin` | Bucket operations (`storageUtils.js`). |
| **Image Processing**| Jimp | `v1.6.0` | In-memory image watermarking (`watermark.service.js`). |
| **Uploads** | Multer | `v2.0.2` | Memory storage strategy (`multer.memoryStorage()`). |
| **Security & Utilities**| Helmet, Cors, RateLimit | `helmet v8.1`, `express-rate-limit v7.5` | Global API rate limiter (100 req/15min). |

---

## 2. Environment Variables (`backend/.env`)

```env
PORT=3000
MONGODB_URI=mongodb+srv://<USER>:<PASS>@<CLUSTER>.mongodb.net/<DB_NAME>
USE_GEMINI_API=true
GCP_PROJECT_ID=your-gcp-project-id
GCP_LOCATION=us-central1
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
GOOGLE_APPLICATION_CREDENTIALS=./gen-lang-client-*.json
GENERATION_MAX_ATTEMPTS=6
GENERATION_EXTERNAL_REQUEST_TIMEOUT_MS=60000
```
