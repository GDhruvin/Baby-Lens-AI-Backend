# Backend Working Context — Active Epic: Google Play Developer API Integration

> **Why this exists:** Active implementation spec for backend purchase verification using Google Play Developer API.
> **Who should read it:** Backend developers working on `/api/payments/verify-google-play` or GCP Service Accounts.
> **Maintenance:** Update as backend billing milestones are completed.

---

## 1. Objective

Integrate backend verification for Google Play Native Consumable Purchases, replacing mock payment logic with authoritative server-side Google Play Developer API checks.

---

## 2. Backend Implementation Flow

1.  **GCP Service Account Configuration**:
    - JSON credentials placed at `./config/google-play-service-account.json`.
    - Env vars: `GOOGLE_PLAY_PACKAGE_NAME=com.babylens`.
2.  **Verification Route**: `POST /api/payments/verify-google-play`
    - Payload: `{ purchaseToken, productId, obfuscatedExternalAccountId }`.
    - Calls Google Play Developer API: `inappproducts.purchases.get`.
    - Validates `purchaseState === 0` (Purchased) and matches `obfuscatedExternalAccountId` to target Firebase User UID.
3.  **Database Updates**:
    - Creates `Purchase` record (`transaction_id`, `purchase_token`, `package_id`, `price_paid`).
    - Creates `CreditTransaction` record.
    - Atomically increments `User.credits`.
