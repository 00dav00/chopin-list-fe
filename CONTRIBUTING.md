# Contributing

This guide covers how to validate changes locally before opening a pull request.

## Prerequisites

- Node.js `v20.20.0` (defined in `.nvmrc`). Activate with `nvm use`.
- npm (bundled with Node).

## Run tests

Install dependencies once:

```bash
make install
```

Then, before opening a PR, run:

```bash
make test
```

`make test` runs the same commands CI runs: `npm test` (vitest) and `npm run check` (svelte-check). Both must exit 0.

For tighter iteration you can run the sub-targets individually: `make vitest` or `make check`.

## Open a PR

Push your branch and open a pull request against `main`. The `Frontend tests` GitHub Actions workflow gates on the same commands `make test` runs — if `make test` is green locally, CI should be too.
