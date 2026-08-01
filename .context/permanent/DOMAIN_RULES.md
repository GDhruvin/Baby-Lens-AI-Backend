# Backend Permanent Context — Domain Rules & Prompt Architecture

> **Why this exists:** Details facial identity extraction parameters, Vertex AI prompt structures, watermarking rules, and anti-abuse policies.
> **Who should read it:** Developers working on Gemini prompts, identity verification, or user credits.
> **Maintenance:** Update when identity heuristics or Gemini prompts change.

---

## 1. Baby Identity Lock Specification (`babyProfile.service.js`)

Vertex AI (`gemini-2.5-flash`) extracts identity features into a strict JSON object:

```json
{
  "age_range": "0-6 months infant",
  "gender": "male",
  "face_lock": "round baby face with soft cheeks",
  "skin_tone": "fair warm skin tone",
  "texture_lock": "smooth soft baby skin",
  "expression_lock": "calm neutral expression"
}
```

### Rejection Criteria (Validation Checks)
1. **Multiple Faces**: `"face_lock": "multiple faces detected"` -> 400 Bad Request.
2. **Not a Baby**: `"age_range": "not a baby - adult or older person detected"` -> 400 Bad Request.
3. **Face Obstructed**: Pacifier, blanket, or hand covering face.
4. **Non-human**: Plush toy, doll, or artwork passed.
5. **Extreme Angle**: Side profile (90 degrees) where only one eye is visible.

---

## 2. Vertex AI Generation Prompt Building (`generation.service.js`)

Prompts blend `Theme.prompt_template` with the baby's `identity_json`:

```
[Theme Prompt Template]

Identity lock to preserve (must follow strictly):
{
  "age_range": "0-6 months infant",
  "gender": "male",
  "face_lock": "round baby face with soft cheeks",
  "skin_tone": "fair warm skin tone",
  "texture_lock": "smooth soft baby skin",
  "expression_lock": "calm neutral expression"
}

Hard rules:
- Preserve the same baby facial identity from the reference image.
- Do not change age appearance, face shape, skin tone, skin texture, or expression.
- Keep output photorealistic and natural.
```

---

## 3. Watermarking & Credit Economy

*   Newly generated photos are saved with `is_unlocked: false`.
*   `watermark.service.js` uses Jimp to overlay brand watermark onto `is_unlocked: false` outputs before streaming via `GET /api/generations/photo/:id`.
*   Unlocking a photo decrements user credits and sets `is_unlocked: true`.
