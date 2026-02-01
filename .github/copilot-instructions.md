# AI Agent Development Guidelines

This document provides instructions for AI coding agents working on **spotify-playlist-e## 🚫 What NOT to Do

- **Do not** add files that weren't requested or required
- **Do not** create documentation files without explicit request (summaries, guides, detailed docs)
- **Do not** skip running tests after making changes
- **Do not** leave commented-out code in commits
- **Do not** commit debugging statements (`console.log`, debugger, etc.)
- **Do not** use magic numbers or strings without explaining them
- **Do not** ignore TypeScript errors or use `@ts-ignore` without justification
- **Do not** overuse emojis in documentation or code commentsFollow these guidelines to maintain code quality, consistency, and reproducibility.

---

## 🔁 Docker-First Development

**All commands must run inside Docker** using one of these methods:

1. **Windows**: `.\run.bat <command>` (from project root, use PowerShell syntax)
2. **macOS/Linux**: `./run.sh <command>` (from project root)
3. **Direct Docker Compose**: `docker compose -f docker/docker-compose.yml run --rm web <command>`

**Never** execute `pnpm`, `node`, `npm`, or toolchain commands directly on the host. Always use the Docker wrappers to ensure environment consistency.

### 🪟 Windows Terminal Commands

**Always use PowerShell syntax** when writing terminal commands for Windows:

- ✅ **Correct**: `.\run.bat test`, `Remove-Item -Recurse`, `Move-Item file.txt dest/`
- ❌ **Incorrect**: `run.bat test` (works in cmd.exe but not PowerShell), `rm -rf folder` (Unix syntax), `mv file dest` (Unix command)

**Important**: If the user is in `cmd.exe` (not PowerShell), they should run scripts without `.\` prefix:
- In **cmd.exe**: `run.bat test`
- In **PowerShell**: `.\run.bat test`

PowerShell commands you'll use frequently:
- `Remove-Item -Recurse -Force <path>` (delete folders/files)
- `Move-Item <source> <destination>` (move/rename files)
- `Copy-Item <source> <destination>` (copy files)
- `Test-Path <path>` (check if file/folder exists)
- `Get-ChildItem <path>` (list directory contents)

### Common Docker Commands

| Task                     | Windows (cmd.exe)                | Windows (PowerShell)             | macOS/Linux                      |
|--------------------------|----------------------------------|----------------------------------|----------------------------------|
| Install dependencies     | `run.bat install`                | `.\run.bat install`              | `./run.sh install`               |
| Add new package          | `run.bat dev pnpm add <package>` | `.\run.bat dev pnpm add <package>`| `./run.sh exec pnpm add <package>`|
| Remove package           | `run.bat dev pnpm remove <package>`| `.\run.bat dev pnpm remove <package>`| `./run.sh exec pnpm remove <package>`|
| Start dev server         | `run.bat up`                     | `.\run.bat up`                   | `./run.sh up`                    |
| Stop dev server          | `run.bat down`                   | `.\run.bat down`                 | `./run.sh down`                  |
| Run tests                | `run.bat test`                   | `.\run.bat test`                 | `./run.sh test`                  |
| Run tests (watch mode)   | `run.bat test --watch`           | `.\run.bat test --watch`         | `./run.sh test -- --watch`       |
| Build (production-like)  | `run.bat prod-build`             | `.\run.bat prod-build`           | `./run.sh prod-build`            |
| Execute arbitrary command| `run.bat dev <cmd>`              | `.\run.bat dev <cmd>`            | `./run.sh exec <cmd>`            |

**Important**: Always use `run.bat dev pnpm add <package>` (Windows) or `./run.sh exec pnpm add <package>` (macOS/Linux) to install packages instead of manually editing `package.json`. This ensures you get the latest compatible versions and properly updates the lockfile.

**Build Testing**: To test if the production build works correctly, use `./run.sh prod-build` instead of `./run.sh exec pnpm build`. The latter uses `NODE_ENV=development` which triggers Next.js 16.1.1 prerendering bugs, while `prod-build` uses `NODE_ENV=production` (matching the CI environment) and builds successfully.

---

## 📚 Library Documentation

**When working with complex libraries (@dnd-kit, TanStack Query, etc.), use the context7 tool** to fetch up-to-date documentation:

1. **Resolve library ID first**: Use `resolve-library-id` with the package name
2. **Fetch docs**: Use `get-library-docs` with the resolved library ID and topic
3. **Example**: For @dnd-kit collision detection, search for "dnd-kit/core" then fetch docs on "collision detection"

This ensures you have accurate, current API documentation rather than relying on potentially outdated knowledge.

---

## 🧪 Testing & Validation Workflow

**After every code change:**

1. **Run TypeScript type check** via `.\run.bat dev pnpm typecheck` (Windows), or `./run.sh exec pnpm typecheck` (macOS/Linux) - this catches unused imports and type errors quickly
2. **Run the test suite** via `.\run.bat test` (Windows PowerShell), `run.bat test` (Windows cmd.exe), or `./run.sh test` (macOS/Linux)
3. **Run linting/formatting** checks if configured
4. **Do not skip validation steps** — automated testing prevents regressions
5. **Provide a one-line commit message** summarizing all changes made using Commit Message Guidelines (see below)

**Note**: Use `pnpm typecheck` instead of full production builds for faster feedback. Production builds are only needed for deployment verification.

If tests fail after your changes:
- Analyze the failure
- Fix the code or update tests appropriately
- Re-run tests to confirm resolution

**When adding new functionality:**
- Write unit tests for new components, hooks, and utilities
- Custom hooks should have comprehensive tests in `tests/unit/` directory
- Use `@testing-library/react` for component and hook testing
- Mock external dependencies (API calls, etc.) using Vitest's `vi.mock()`
- Wrap state updates in React tests with `act()` to avoid warnings

---

## 📝 Documentation Requirements

**Always update documentation when making changes:**

1. **README.md** must reflect:
   - New features or commands
   - Updated setup instructions
   - Changed CLI arguments or environment variables

2. **CONTRIBUTING.md** should be updated if:
   - Development workflow changes
   - New tooling is introduced
   - Testing procedures are modified

3. **Inline code comments** for complex logic:
   - Explain *why*, not *what*
   - Document non-obvious decisions
   - Clarify business logic and edge cases

**Do not create unrequested files** (e.g., new config files, docs, or modules) unless explicitly asked or required by the changes.

**Do not create documentation files** (e.g., guides, summaries, detailed explanations) unless explicitly requested. Keep README.md concise and focused on setup/usage only.

---

## � Clean Code Principles

Follow these best practices when writing or modifying code:

### Code Quality
- **DRY (Don't Repeat Yourself)**: Extract repeated logic into reusable functions/components
- **Single Responsibility**: Each function/component should do one thing well
- **Meaningful Names**: Use descriptive variable/function names (avoid `data`, `temp`, `x`)
- **Small Functions**: Keep functions focused and under ~20 lines when possible
- **Early Returns**: Reduce nesting by returning early from guard clauses

### TypeScript/JavaScript Specifics
- **Type Safety**: Always use proper TypeScript types; avoid `any`
- **Immutability**: Prefer `const` over `let`; avoid mutating objects/arrays
- **Modern Syntax**: Use ES6+ features (destructuring, spread, arrow functions, optional chaining)
- **Error Handling**: Handle errors explicitly; don't leave unhandled promises

### React Best Practices
- **Functional Components**: Use hooks; avoid class components
- **Component Composition**: Break down large components into smaller, reusable pieces
- **Props Validation**: Define clear prop types with TypeScript interfaces
- **Avoid Prop Drilling**: Use context or state management when passing props deeply
- **Custom Hooks**: Extract reusable logic into custom hooks when the same pattern appears in multiple components

### File Organization
- **Consistent Structure**: Follow existing project patterns
- **Logical Grouping**: Co-locate related files (component + styles + tests)
- **Clear Exports**: Use named exports for better refactoring and tree-shaking
- **Custom Hooks Location**: Place custom hooks in the `hooks/` directory with descriptive names (e.g., `useAutoLoadPaginated.ts`)

---

## � Documentation Style

- **Minimize emoji usage**: Use emojis sparingly (max 2-3 per document section). Prefer clear headers and bullet points over emoji-heavy formatting
- **Keep it professional**: Documentation should be scannable and accessible; excessive emojis reduce readability
- **Use standard Markdown**: Prefer `##`, `-`, `*`, and code blocks over decorative symbols

---

## �🚫 What NOT to Do

- **Do not** add files that weren't requested or required
- **Do not** skip running tests after making changes
- **Do not** leave commented-out code in commits
- **Do not** commit debugging statements (`console.log`, debugger, etc.)
- **Do not** use magic numbers or strings without explaining them
- **Do not** ignore TypeScript errors or use `@ts-ignore` without justification
- **Do not** overuse emojis in documentation or code comments
- **Do not** create unrequested files, especially documentation markdown files

---

## 📝 Commit Message Guidelines

**MANDATORY: Always generate a commit message after making ANY code changes.**

This is a required step - never skip it. After editing files, always:
1. Use `get_changed_files` tool to examine all uncommitted changes
2. Review the diffs to understand the scope of changes
3. Generate a concise commit message (even if the user didn't explicitly ask for it)

**Format requirements:**
- **Style**: Single line, imperative mood (e.g., "Add feature" not "Added feature")
- **Length**: 50-72 characters preferred
- **Content**: Summarize what changed and why, not how
- **Completeness**: Include ALL modified files in your analysis, not just the most recent changes

**Good examples:**
- ✅ `Add auto-load pagination hook with comprehensive tests`
- ✅ `Refactor playlist components to use useAutoLoadPaginated`
- ✅ `Fix OAuth redirect URI to use 127.0.0.1`
- ✅ `Improve premium required error message clarity`

**Bad examples:**
- ❌ `Updated some files` (too vague)
- ❌ `Changed PlaylistDetail.tsx and PlaylistsGrid.tsx to use the new hook and also added tests` (too long)
- ❌ Not providing a commit message at all (NEVER skip this step)

**When to generate (ALWAYS):**
- After completing any task that modified files
- After bug fixes, refactoring, or feature additions
- Even for small changes like typo fixes or comment updates
- Before ending your response if any files were modified

## ✅ Before Completing a Task

Ensure you have:

1. ✅ Run all code changes through Docker helpers
2. ✅ Executed the test suite successfully
3. ✅ Updated relevant documentation (README, CONTRIBUTING, etc.)
4. ✅ Followed clean code principles and project conventions
5. ✅ Verified no unrequested files were created
6. ✅ Removed any debug code or unnecessary comments
7. ✅ **MANDATORY**: Generated a one-line commit message summarizing all changes (NEVER skip this!)

**The commit message is not optional** - it must be provided for every code change, no exceptions.

