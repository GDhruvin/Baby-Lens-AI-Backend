# Backend AI Workflow — 7-Step Protocol

> **Why this exists:** Mandatory protocol for AI assistants working on backend code.
> **Who should read it:** AI coding agents working in `/backend`.
> **Maintenance:** Update if context loading or verification rules change.

---

## 7-Step Execution Protocol

1. **Read Index**: Open [backend/.context/SUMMARY.md](file:///d:/program/BabyLens/backend/.context/SUMMARY.md).
2. **Read Target Context**: Open specific backend sub-documents (`ARCHITECTURE.md`, `CODING_STANDARDS.md`).
3. **Verify Conventions**: Ensure CommonJS (`require`), async controllers with `next(error)`, and `snake_case` models.
4. **Verify API Spec**: Check [backend/.context/working/API_SPECIFICATION.md](file:///d:/program/BabyLens/backend/.context/working/API_SPECIFICATION.md).
5. **Inspect Target Files**: Read only the target controller, route, service, or model files.
6. **Implement & Verify**: Write clean code and verify with Nodemon / curl.
7. **Update Context**: Execute maintenance protocol in [backend/.context/workflow/MAINTENANCE_STRATEGY.md](file:///d:/program/BabyLens/backend/.context/workflow/MAINTENANCE_STRATEGY.md).
