---
name: API Server Build Quirks
description: ESM/CJS compatibility issues encountered when building the Express+Mongoose API server with esbuild
---

## Zod Version
- Workspace uses Zod v3 (catalog: ^3.x). Do NOT use `zod/v4` sub-path or `z.email()` or `z.prettifyError()` — those are Zod v4 APIs.
- Use `z.string().email()` and `error.issues.map(i => i.message).join(", ")` instead.

**Why:** The workspace catalog pins zod at ^3.25.76 and esbuild will fail at bundle time if you use the `zod/v4` sub-path export.

## CJS-only packages
- `archiver` is CJS-only. Cannot be imported as ESM default (`import archiver from "archiver"` fails at runtime).
- Fix: add to `external` list in `build.mjs` AND use `createRequire` at top of the file:
  ```ts
  import { createRequire } from "node:module";
  const _require = createRequire(import.meta.url);
  const archiver = _require("archiver") as typeof import("archiver");
  ```
- `sharp` is also externalized (native module).

**Why:** The build format is ESM (`format: "esm"`), but some deps only ship CJS. The banner in build.mjs adds `globalThis.require` but it doesn't help with named import resolution.

## Dependencies to remove
- `@workspace/db` — the api-server does NOT use Drizzle/PostgreSQL. This was left in from the scaffold template. Remove from package.json and from tsconfig.json references.
- `drizzle-orm` — same reason, remove from api-server package.json.

**Why:** Referencing lib/db in tsconfig caused TypeScript to require DATABASE_URL env var at build time.
