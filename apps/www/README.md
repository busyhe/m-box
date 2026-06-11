# www

A [TanStack Start](https://tanstack.com/start) app living inside a pnpm + Turbo monorepo.

## Tech Stack

- **Framework**: [TanStack Start](https://tanstack.com/start) + [TanStack Router](https://tanstack.com/router) (file-based routing, SSR)
- **UI**: React 19, [Tailwind CSS v4](https://tailwindcss.com/), [lucide-react](https://lucide.dev/), [`next-themes`](https://github.com/pacocoursey/next-themes) for dark mode
- **Shared**: [`@workspace/ui`](../../packages/ui) — internal component library
- **Tooling**: Vite 8, TypeScript 5.9 (strict), Vitest + Testing Library + jsdom

## Prerequisites

- Node.js **>= 20**
- pnpm **>= 10.27**

## Quick Start

Run from the monorepo root:

```bash
pnpm install
cp apps/www/.env.example apps/www/.env

# start every app via turbo
pnpm dev

# or only this app
pnpm --filter www dev
```

The dev server runs on [http://localhost:3000](http://localhost:3000).

## Scripts

| Command        | Description                    |
| -------------- | ------------------------------ |
| `pnpm dev`     | Start Vite dev server on :3000 |
| `pnpm build`   | Build for production           |
| `pnpm preview` | Preview the production build   |
| `pnpm test`    | Run Vitest once                |

Run scoped from the root with `pnpm --filter www <script>`.

## Environment Variables

Defined in [.env.example](.env.example):

| Variable        | Required | Description                                           |
| --------------- | -------- | ----------------------------------------------------- |
| `VITE_SITE_URL` | yes      | Public base URL of the site (used for OG metadata).   |
| `VITE_GA_ID`    | no       | Google Analytics ID — analytics is disabled if empty. |

## Project Structure

```text
src/
├── routes/              # file-based routes (__root, index, api.health, ...)
├── components/          # site-header, site-footer, providers, header/*, analytics
├── config/site.ts       # site metadata (name, description, links)
├── assets/              # static images
├── router.tsx           # router setup
├── routeTree.gen.ts     # auto-generated — do not edit
└── styles.css           # Tailwind entry
```

Configuration lives in [vite.config.ts](vite.config.ts) and [tsconfig.json](tsconfig.json).

### Path Aliases

Both `@/*` and `#/*` resolve to `src/*`:

```ts
import { siteConfig } from '@/config/site'
import { Providers } from '#/components/providers'
```

## Monorepo Context

This app is one workspace inside a [Turbo](https://turbo.build/)-orchestrated pnpm monorepo. Related packages:

- [`packages/ui`](../../packages/ui) — shared UI components (`@workspace/ui`)
- [`packages/eslint-config`](../../packages/eslint-config) — shared ESLint presets
- [`packages/typescript-config`](../../packages/typescript-config) — shared `tsconfig` bases

Monorepo-wide scripts (build, lint, check-types) are defined in the [root package.json](../../package.json).

## Author

Created by [busyhe](https://github.com/busyhe).
