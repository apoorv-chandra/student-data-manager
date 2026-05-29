---
name: OpenAPI Schema Naming
description: Rules for naming schemas in openapi.yaml to avoid Orval codegen collisions
---

## Rule
Schema names must be entity-shaped (nouns), never operation-shaped (verb+noun).

**Bad (causes TS2308 duplicate export):**
- `LoginRequest` — Orval generates its own `LoginRequest` from the `login` operationId
- `LoginResponse` — same collision
- `SetPasswordRequest` — same pattern

**Good (entity-shaped, no collision):**
- `LoginCredentials` instead of `LoginRequest`
- `AuthResult` instead of `LoginResponse`
- `PasswordUpdate` instead of `SetPasswordRequest`

**Why:** Orval auto-generates types named `<OperationId>Request` and `<OperationId>Response` from the operationId. If your schema is named the same thing, TypeScript throws TS2308 "already exported a member named X".

**How to apply:** When writing new schemas, always use noun/entity names that describe the data structure, not the operation. Check `lib/api-zod/src/index.ts` for collisions after codegen.
