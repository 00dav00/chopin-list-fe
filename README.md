# Chopin List Frontend

Frontend application for Chopin List, built with Svelte + Vite.

## Prerequisites

- Node.js `v20.20.0` (defined in `.nvmrc`)
- npm

## Getting Started

1. Use the correct Node version:

```bash
nvm use
```

2. Install dependencies:

```bash
npm install
```

3. Create your local environment file:

```bash
cp .env.example .env
```

4. Start the development server:

```bash
npm run dev
```

The app will be available at the local Vite URL shown in your terminal.

## Environment Variables

Configured in `.env`:

- `VITE_API_BASE_URL`: backend API base URL
- `VITE_GOOGLE_CLIENT_ID`: Google OAuth client ID for sign-in

## Available Scripts

- `npm run dev`: start local dev server
- `npm run build`: create production build in `dist/`
- `npm run preview`: serve the production build locally
- `npm run test`: run unit tests once
- `npm run test:watch`: run tests in watch mode
- `npm run test:coverage`: run tests with coverage report
- `npm run check`: run Svelte + TypeScript diagnostics

## Project Structure

- `src/main.ts`: app bootstrap
- `src/App.svelte`: app shell and routing
- `src/routes/`: page-level components
- `src/lib/`: shared frontend logic (API, auth, types, errors)
- `src/stores/`: client-side state
