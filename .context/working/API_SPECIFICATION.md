# Backend Working Context — REST API Specification

> **Why this exists:** Authoritative documentation for all REST API endpoints, parameters, JSON schemas, and error codes.
> **Who should read it:** Backend developers adding/modifying endpoints and mobile developers connecting APIs.
> **Maintenance:** Update whenever endpoints, request schemas, or status codes change.

---

## 1. Global Standards

*   **Base URL**: `http://<HOST>:3000/api`
*   **Header**: `Authorization: Bearer <Firebase_ID_Token>`
*   **Error Response Envelope**:
    ```json
    {
      "error_code": "STRING_IDENTIFIER",
      "message": "Human readable description"
    }
    ```

---

## 2. Endpoints Summary

### Auth (`/api/auth`)
*   `POST /api/auth/login`: Authenticates/registers user via Firebase token & device ID.

### Baby Profiles (`/api/baby-profiles`)
*   `POST /api/baby-profiles`: Uploads photo, runs Vertex AI identity extraction, creates profile.
*   `GET /api/baby-profiles`: Lists user's baby profiles.
*   `DELETE /api/baby-profiles/:id`: Deletes baby profile and reference image.

### Generations (`/api/generations`)
*   `POST /api/generations/create`: Triggers Vertex AI photoshoot image generation.
*   `GET /api/generations/my-photos`: Paginated list of user's photoshoot photos.
*   `GET /api/generations/photo/:id`: Streams photo (watermarked if locked, pristine if unlocked).
*   `DELETE /api/generations/:id`: Deletes photoshoot record & file.

### Themes (`/api/themes`)
*   `GET /api/themes`: Fetches categories and theme templates.

### Payments (`/api/payments`)
*   `POST /api/payments/mock-purchase`: Simulates credit package purchase.
*   `POST /api/payments/verify-google-play`: Verifies Google Play purchase token and adds credits.
