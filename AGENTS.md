# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the application code. Put feature screens and dialogs in `src/components/`, and keep reusable primitives in `src/components/ui/`. Shared logic belongs in `src/lib/` (for example `supabase.ts`, `supabase-service.ts`, and PDF/export helpers). Place custom React hooks in `src/hooks/`, and theme or global CSS in `src/styles/`, `src/main.css`, and `src/index.css`. Track database changes in `supabase/migrations/`; `dist/` is generated build output and should not be edited.

## Build, Test, and Development Commands
- `npm install`: install dependencies from `package-lock.json`.
- `npm run dev`: start the Vite development server.
- `npm run build`: run `tsc -b --noCheck` and create a production bundle in `dist/`.
- `npm run preview`: serve the built app locally for a final smoke check.
- `npm run kill`: free port `5000` if a stale local process is blocking the workspace.
- `npm run lint`: defined in `package.json`, but currently fails until an `eslint.config.*` file is added for ESLint 9.

## Coding Style & Naming Conventions
Use TypeScript and React function components. Follow the existing code style in `src/`: 2-space indentation, single quotes, minimal comments, and `@/` path aliases for internal imports. Use `PascalCase` for components (`AddExpenseDialog.tsx`), `camelCase` for helpers and variables, and `use-*.ts` for hooks. Keep Supabase reads and writes in `src/lib/` services rather than scattering direct client calls through UI components.

## Testing Guidelines
No automated test runner or coverage gate is committed yet. Until one is added, treat `npm run build` and manual verification of auth, bills, analytics, exports, and group switching as the minimum regression check. If you introduce tests in a PR, prefer `*.test.ts` or `*.test.tsx` files colocated with the feature or under `src/__tests__/`, and document how to run them.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commits such as `feat:`, `fix:`, `style:`, `refactor:`, `perf:`, and `chore:`. Keep commit subjects short, imperative, and specific, for example `fix: prevent duplicate personal group creation`. PRs should include a concise summary, linked issue or task, screenshots for UI changes, and notes for any `.env.local` or `supabase/migrations` updates.

## Security & Configuration Tips
Copy `.env.example` values into `.env.local` and never commit secrets. When schema behavior changes, add a new SQL migration in `supabase/migrations/` instead of editing the database manually.
