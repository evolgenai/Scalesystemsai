# AGENTS.md

## Cursor Cloud specific instructions

This repo is a single **Next.js 15 (App Router) + React 19** application named `scalesystems` (npm, `package-lock.json`). It's a marketing site (`/`, `/services`, `/contact`), a client-side dashboard (`/dashboard`), and two API routes (`/api/agent`, `/api/contact`). There is no test suite.

Standard commands live in `package.json` `scripts`:
- Dev server: `npm run dev` (Next.js + Turbopack on `http://localhost:3000`). This is the primary way to run the app.
- Lint: `npm run lint` (passes with only unused-import warnings in `AgentTerminal.tsx`).
- Build: `npm run build` (runs `prisma generate && next build`).

Non-obvious caveats:
- **Prisma tooling needs `DATABASE_URL`.** `prisma.config.ts` resolves `env("DATABASE_URL")` and errors if it's unset, so `prisma generate`, `npm run db:generate`, and `npm run build` fail without it. A gitignored `.env` with a placeholder `DATABASE_URL` is present in the VM to satisfy this. No runtime code path actually connects to a database (`getPrisma()` in `src/lib/prisma.ts` is never called), so `npm run dev` serves every page/route without a real DB.
- **`npm run build` currently fails** on a pre-existing empty, committed file `src/app/api/auth/register/route.ts` (TS error: "not a module"). This is a repo code issue, not an environment issue; `npm run dev` is unaffected because Next.js compiles routes lazily and that route is never requested.
- **Do not run `npm run build` while `npm run dev` is running.** They share the `.next` directory; the build corrupts the dev server's manifests and pages start returning 500. If that happens, stop dev, `rm -rf .next`, and restart `npm run dev`.
- **`/api/contact` POSTs leads to a real hardcoded Discord webhook** (`src/app/api/contact/route.ts`). Avoid submitting the contact form during testing so you don't send spam to that webhook.
