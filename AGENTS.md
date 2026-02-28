# Repository Guidelines

## Running npm commands
- Always execute nvm use before npm commands

## Project Structure & Module Organization
- `src/main.ts` boots the app and `src/App.svelte` hosts routing.
- `src/routes/*.svelte` contains page-level UI (for example `Lists.svelte`, `Templates.svelte`, `ListDetail.svelte`).
- `src/lib/*` contains shared frontend logic (`api.ts`, `errors.ts`, `types.ts`).
- `src/stores/*` contains client state such as auth.
- Tests are co-located under `src/**/*.test.ts`; shared test helpers live in `src/test/setup.ts` and `src/test/utils/*`.
- Generated output goes to `dist/`; coverage reports go to `coverage/`.

## Build, Test, and Development Commands
- `npm run dev`: start Vite dev server.
- `npm run build`: create production bundle in `dist/`.
- `npm run preview`: serve the built bundle locally.
- `npm test`: run Vitest once.
- `npm run test:watch`: run tests in watch mode.
- `npm run test:coverage`: run tests with V8 coverage (text + HTML).
- `npm run check`: run `svelte-check` type and Svelte diagnostics.

Use the Node version in `.nvmrc` (`v20.20.0`) before running commands.

## Coding Style & Naming Conventions
- Use TypeScript in Svelte/TS files with 2-space indentation.
- Match existing style: double quotes, semicolons, and concise functions.
- Use PascalCase for route/components (`TemplateDetail.svelte`).
- Use camelCase/lowercase for TS modules (`auth.ts`, `api.ts`).
- Keep API payload/result typing in `src/lib/types.ts` with clear suffixes like `Out`, `Create`, `Update`.

## Testing Guidelines
- Framework: Vitest + Testing Library (`@testing-library/svelte`) in `jsdom`.
- File pattern: `src/**/*.test.ts` (configured in `vite.config.ts`).
- Prefer behavior-focused tests (render, user interactions, API calls).
- Reuse factories/utilities from `src/test/utils/`.
- For changes in `src/lib` or `src/stores`, run `npm run test:coverage` and verify coverage remains meaningful.

## Commit & Pull Request Guidelines
- Follow existing history style: short imperative commits (example: `Add test coverage for the frontend`).
- Keep commits focused to one logical change.
- PRs should include: summary, why the change is needed, linked issue/ticket, and test evidence.
- Include screenshots/GIFs for UI changes in `src/routes/*`.
- Call out config/env updates (for example `.env.example`, auth, API base URL).

## Security & Configuration Tips
- Copy `.env.example` to `.env` for local setup.
- Never commit secrets or private keys.
- Keep backend target configurable via `VITE_API_BASE_URL`.
