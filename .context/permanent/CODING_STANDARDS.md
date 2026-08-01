# Backend Permanent Context — Coding Standards & Conventions

> **Why this exists:** Enforces backend module systems, controller patterns, Mongoose schema conventions, and error handling rules.
> **Who should read it:** Engineers/AI writing backend Javascript code.
> **Maintenance:** Update when backend coding rules evolve.

---

## 1. CommonJS Module Standard (MANDATORY)

*   **Rule**: ALL backend files MUST use `require()` and `module.exports`.
*   **Prohibited**: `import` / `export` statements. Do NOT add `"type": "module"` to `package.json`.

```javascript
// ✅ CORRECT
const express = require("express");
const router = express.Router();
module.exports = router;

// ❌ WRONG
import express from "express";
export default router;
```

---

## 2. Controller & Error Handling Pattern

*   Controllers must be `async` functions wrapped in `try / catch`.
*   Unhandled errors MUST be passed to `next(error)` so Express global `errorHandler` processes them.

```javascript
// ✅ CORRECT Controller Pattern
async function create(req, res, next) {
  try {
    const userId = req.user.id;
    const result = await generationService.createGeneration({ userId, ...req.body });
    return res.status(200).json({
      message: "Success",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
```

---

## 3. Mongoose Schema Conventions

*   Use `snake_case` for all model properties (`user_id`, `created_at`, `is_unlocked`).
*   Always include timestamps: `{ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }`.
*   Add indexes to fields queried frequently (`auth_uid`, `device_id`).

```javascript
const mongoose = require("mongoose");

const babyProfileSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  baby_name: { type: String, required: true, trim: true },
  identity_json: { type: Object, required: true },
}, {
  timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
});

module.exports = mongoose.model("BabyProfile", babyProfileSchema);
```
