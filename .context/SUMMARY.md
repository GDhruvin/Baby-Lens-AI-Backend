# BabyLens Backend — AI Context Index & Routing Guide

> **Purpose:** This document is the entry point for AI assistants and human developers working on the BabyLens Backend codebase (`/backend`). Use this index to load only the backend context required for your current task.

---

## 1. Quick Navigation Matrix

| Task Domain | Primary Context File | Secondary Context File |
| :--- | :--- | :--- |
| **Backend Architecture & Data Flow** | [backend/.context/permanent/ARCHITECTURE.md](file:///d:/program/BabyLens/backend/.context/permanent/ARCHITECTURE.md) | [backend/.context/permanent/TECH_STACK.md](file:///d:/program/BabyLens/backend/.context/permanent/TECH_STACK.md) |
| **Express Controllers, Routes & Schemas** | [backend/.context/permanent/CODING_STANDARDS.md](file:///d:/program/BabyLens/backend/.context/permanent/CODING_STANDARDS.md) | [backend/.context/working/API_SPECIFICATION.md](file:///d:/program/BabyLens/backend/.context/working/API_SPECIFICATION.md) |
| **Vertex AI, Gemini Prompts & Identity** | [backend/.context/permanent/DOMAIN_RULES.md](file:///d:/program/BabyLens/backend/.context/permanent/DOMAIN_RULES.md) | [backend/.context/working/API_SPECIFICATION.md](file:///d:/program/BabyLens/backend/.context/working/API_SPECIFICATION.md) |
| **Google Play Verification & Payments** | [backend/.context/working/ACTIVE_ROADMAP.md](file:///d:/program/BabyLens/backend/.context/working/ACTIVE_ROADMAP.md) | [backend/.context/working/API_SPECIFICATION.md](file:///d:/program/BabyLens/backend/.context/working/API_SPECIFICATION.md) |
| **Starting a Backend AI Session** | [backend/.context/workflow/AI_DEVELOPMENT_WORKFLOW.md](file:///d:/program/BabyLens/backend/.context/workflow/AI_DEVELOPMENT_WORKFLOW.md) | [backend/.context/workflow/MAINTENANCE_STRATEGY.md](file:///d:/program/BabyLens/backend/.context/workflow/MAINTENANCE_STRATEGY.md) |

---

## 2. Directory Structure

```
backend/.context/
├── SUMMARY.md                         # Master index for backend AI sessions
├── permanent/                         # Permanent Backend Knowledge
│   ├── ARCHITECTURE.md                # Route-Controller-Service-Model architecture
│   ├── TECH_STACK.md                  # Node.js 22, Express 5.2, Mongoose, Vertex AI
│   ├── CODING_STANDARDS.md            # CommonJS (require), async/catch, snake_case schemas
│   └── DOMAIN_RULES.md                # Facial identity extraction, prompts, watermarking
├── working/                           # Active Backend Epics & API Spec
│   ├── ACTIVE_ROADMAP.md              # Google Play Billing backend verification setup
│   └── API_SPECIFICATION.md           # REST API endpoints, bodies, headers, error codes
└── workflow/                          # AI Development Rules
    ├── AI_DEVELOPMENT_WORKFLOW.md     # 7-Step protocol for backend AI tasks
    └── MAINTENANCE_STRATEGY.md        # Updating backend context post-development
```

---

## 3. Mandatory Backend Rules

1. **CommonJS Only**: Always use `require()` and `module.exports`.
2. **Error Delegation**: Controllers must be async and call `next(error)`.
3. **Database Schemas**: Fields must use `snake_case` with explicit timestamps.
