# AI Agent Development Guidelines

This document defines the working rules for AI coding agents in this repository.

## 🚫 What Not to Do

- Do not add files that were not requested or required.
- Do not create documentation files without explicit request.
- Do not skip validation after making changes.
- Do not leave commented-out code or debugging statements (`console.log`, `debugger`).
- Do not use magic numbers/strings without context.
- Do not ignore TypeScript errors or use `@ts-ignore` without clear justification.
- Do not overuse emojis in docs/comments.

## 🔁 Docker-First Development

All commands must run inside Docker:

1. Windows PowerShell: `\.\run.bat <command>`
2. macOS/Linux: `./run.sh <command>`
3. Direct compose: `docker compose -f docker/docker-compose.yml run --rm web <command>`

Never run `pnpm`, `node`, or `npm` directly on the host.

### Common Commands

| Task | Windows (PowerShell) | macOS/Linux |
|---|---|---|
| Install dependencies | `\.\run.bat install` | `./run.sh install` |
| Add package | `\.\run.bat dev pnpm add <package>` | `./run.sh exec pnpm add <package>` |
| Remove package | `\.\run.bat dev pnpm remove <package>` | `./run.sh exec pnpm remove <package>` |
| Start app | `\.\run.bat up` | `./run.sh up` |
| Stop app | `\.\run.bat down` | `./run.sh down` |
| Run tests | `\.\run.bat test` | `./run.sh test` |
| Quality gate | `\.\run.bat quality` | `./run.sh quality` |

Use command wrappers to install packages so lockfiles are updated correctly.

## 📚 Library Documentation

For complex libraries (e.g., `@dnd-kit`, TanStack Query), use context7:

1. Resolve library ID with `resolve-library-id`.
2. Fetch docs with `get-library-docs` for the relevant topic.

## 🧪 Testing & Validation Workflow

After every code change, run:

1. Type check (`\.\run.bat dev pnpm typecheck` or `./run.sh exec pnpm typecheck`)
2. Tests (`\.\run.bat test` or `./run.sh test`)
3. Quality check (`\.\run.bat quality` or `./run.sh quality`)

### Mandatory quality gate

- The task is **not complete** until `./run.sh quality` (Linux/macOS) or `\.\run.bat quality` (Windows) passes.
- If quality checks fail, fix the reported issues and re-run quality checks before finishing.

When adding functionality, also add or update tests where appropriate.

## 🧼 Clean Code and Reduction Strategy

Use clean-code principles by default:

- DRY, single responsibility, meaningful names, small focused functions, early returns.
- Strong TypeScript typing, immutability-first, explicit error handling.
- Prefer composition and reusable hooks/components over duplicated logic.

### Reducing lines of code (LOC)

When asked to reduce code size/complexity, do **not** only split files mechanically.

- Reduce complexity by extracting cohesive, self-contained modules.
- Keep clear boundaries between domain logic, orchestration, and transport/UI layers.
- Ensure each module has a single clear purpose and a stable interface.
- Remove duplication and dead branches before introducing new abstractions.
- Avoid over-engineering or premature abstraction; focus on clarity and maintainability.
- Organize (new) modules in subfolders by domain or layer to improve discoverability and reduce coupling.

## Architecture Boundaries

1. `app/api/**/route.ts` handlers are orchestrators only (validate input, call services, map known errors).
2. Auth/token lifecycle stays in `lib/auth/*`.
3. Spotify transport logic stays in provider layer (`lib/music-provider/*`).
4. Preserve existing API contracts unless explicitly asked to change.
5. Keep API route complexity in check (cyclomatic complexity <= 12, max depth <= 3).
6. Keep service layers provider-agnostic where possible.
7. For auth/provider boundary changes, update tests for retry/refresh/error mapping behavior.

## 📝 Documentation Requirements

- Update `README.md` and/or `CONTRIBUTING.md` when workflow, setup, or commands change.
- Keep docs concise and professional; explain non-obvious decisions.
- Do not create unrequested standalone docs.

## 📝 Commit Message Guidelines

Always provide a one-line commit message suggestion after any file edits.

- Style: imperative mood
- Length: preferably 50-72 chars
- Scope: summarize what changed and why

## ✅ Before Completing a Task

Confirm all of the following:

1. Changes were made through Docker-first workflow.
2. Type checks and tests were run (where applicable).
3. `./run.sh quality` / `\.\run.bat quality` passes.
4. Any reported quality issues were fixed and re-validated.
5. No unrequested files were added.
6. No debug leftovers or commented-out code remain.
7. A one-line commit message suggestion is included.

