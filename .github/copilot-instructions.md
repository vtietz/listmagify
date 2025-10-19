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
| Start dev server         | `run.bat up`                     | `.\run.bat up`                   | `./run.sh start`                 |
| Run tests                | `run.bat test`                   | `.\run.bat test`                 | `./run.sh test`                  |
| Run tests (watch mode)   | `run.bat test --watch`           | `.\run.bat test --watch`         | `./run.sh test -- --watch`       |
| Execute arbitrary command| `run.bat dev <cmd>`              | `.\run.bat dev <cmd>`            | `./run.sh exec <cmd>`            |

**Important**: Always use `run.bat dev pnpm add <package>` (Windows) or `./run.sh exec pnpm add <package>` (macOS/Linux) to install packages instead of manually editing `package.json`. This ensures you get the latest compatible versions and properly updates the lockfile.

---

## 🧪 Testing & Validation Workflow

**After every code change:**

1. **Run the test suite** via `.\run.bat test` (Windows PowerShell), `run.bat test` (Windows cmd.exe), or `./run.sh test` (macOS/Linux)
2. **Verify the build** if applicable
3. **Run linting/formatting** checks if configured
4. **Do not skip validation steps** — automated testing prevents regressions

If tests fail after your changes:
- Analyze the failure
- Fix the code or update tests appropriately
- Re-run tests to confirm resolution

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

### File Organization
- **Consistent Structure**: Follow existing project patterns
- **Logical Grouping**: Co-locate related files (component + styles + tests)
- **Clear Exports**: Use named exports for better refactoring and tree-shaking

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

---

## ✅ Before Completing a Task

Ensure you have:

1. ✅ Run all code changes through Docker helpers
2. ✅ Executed the test suite successfully
3. ✅ Updated relevant documentation (README, CONTRIBUTING, etc.)
4. ✅ Followed clean code principles and project conventions
5. ✅ Verified no unrequested files were created
6. ✅ Removed any debug code or unnecessary comments
7. ✅ Provided a one-line summary of changes made for the commit message

---

Following these guidelines ensures maintainable, high-quality contributions. Thank you for adhering to these standards!
