# Mise

Kitchen operating system monorepo: **Sanity Studio v6**, **Astro 7** frontend on **Cloudflare Workers**, and **AI-powered localization** (en-US + hi-IN).

## Stack

| Workspace                      | Description                                        |
| ------------------------------ | -------------------------------------------------- |
| `apps/studio/`                 | Sanity Studio v6 with Mise content schemas         |
| `apps/web/`                    | Astro frontend (Cloudflare Workers)                |
| `packages/l10n/`               | Agentic translation plugin, glossary, style guides |
| `packages/design-tokens/`      | Sage & Stone design tokens from `docs/DESIGN.md`   |
| `functions/`                   | Stale translation detection (Sanity Functions)     |
| `apps/translations-dashboard/` | Translation coverage dashboard                     |

## Prerequisites

- Node.js >= 22.12
- pnpm 10.x
- Sanity account ([sanity.io/manage](https://www.sanity.io/manage))

## Sanity project

- Organization: [ofsMxPwd5](https://www.sanity.io/organizations/ofsMxPwd5)
- Project: **Mise Kitchen OS** (`1rkupi9j`)
- Dataset: `production` (public read for Astro static build)
- Hosted Studio: https://mise-kitchen-os.sanity.studio/

Copy `.env.example` to `.env` and set your project ID, or run:

```bash
cd apps/studio
pnpm exec sanity projects create "Mise Kitchen OS" --organization=ofsMxPwd5 --yes --json
pnpm exec sanity dataset create production --visibility public
```

## Setup

1. Copy env and link a Sanity project:

```bash
cp .env.example .env
# Add SANITY_STUDIO_PROJECT_ID and SANITY_STUDIO_DATASET
```

2. Install and bootstrap:

```bash
pnpm install
pnpm bootstrap
```

Bootstrap deploys blueprint, schema (via hosted Studio deploy), seeds locales (`en-US`, `hi-IN`), and imports sample Mise content.

> **Schema deploy:** `sanity schemas deploy` may abort on some Node/macOS setups. Use `pnpm --filter studio run schema:deploy` (runs `sanity deploy`) which deploys schema + Studio to https://mise-kitchen-os.sanity.studio/.

3. Start development:

```bash
pnpm dev
```

- Studio: http://localhost:3333
- Translations dashboard: http://localhost:3334
- Web: http://localhost:4321

## Localization

- Document-level i18n: `recipe`, `homePage`, `mealPlanEntry`, `pantrySnapshot`
- Field-level i18n: `ingredient`, `recipeCategory`, `pantryCategory`
- Hindi style guide + culinary glossary seeded in sample data
- Translate drafts via Studio translation pane or Agent API (`client.agent.action.translate`)

Add a locale: create `l10n.locale` doc → seed style guide → add to Astro `i18n.locales` → bulk translate.

## Deploy

**Production** (`mise-web` → https://mise-web.shehjkhan.workers.dev):

```bash
pnpm --filter web build && pnpm --filter web deploy
```

**Dev** (`mise-web-dev` → https://mise-web-dev.shehjkhan.workers.dev):

```bash
pnpm --filter web build && pnpm --filter web deploy:dev
```

Studio deploy (set `SANITY_STUDIO_HOSTNAME` — slug only, no `https://`):

```bash
# Production
SANITY_STUDIO_HOSTNAME=mise-kitchen-os pnpm --filter studio deploy

# Development (same production dataset)
SANITY_STUDIO_HOSTNAME=mise-kitchen-os-dev pnpm --filter studio deploy
```

GitHub Actions workflow: `.github/workflows/deploy.yml`

| Branch / trigger        | Deploys                                                     |
| ----------------------- | ----------------------------------------------------------- |
| Push to `main`          | Production web + production Studio (when paths match)       |
| Push to `develop`       | Dev web + development Studio (when paths match)             |
| Manual **Run workflow** | Web target + **Deploy Sanity Studio** (production/dev/both) |

### GitHub Actions deploy config

**Production** and **Development** are separate GitHub environments. Add values under **Settings → Secrets and variables → Actions → Environments** (not repository-level secrets).

| Name                        | Type     | Used by             | Production example                       | Development example                          |
| --------------------------- | -------- | ------------------- | ---------------------------------------- | -------------------------------------------- |
| `SANITY_STUDIO_PROJECT_ID`  | Variable | all                 | `1rkupi9j`                               | `1rkupi9j`                                   |
| `SANITY_STUDIO_DATASET`     | Variable | all                 | `production`                             | `production`                                 |
| `SANITY_STUDIO_HOSTNAME`    | Variable | studio / studio-dev | `mise-kitchen-os`                        | `mise-kitchen-os-dev`                        |
| `SANITY_STUDIO_URL`         | Variable | web, studio         | `https://mise-kitchen-os.sanity.studio`  | `https://mise-kitchen-os-dev.sanity.studio`  |
| `SANITY_STUDIO_PREVIEW_URL` | Variable | studio / studio-dev | `https://mise-web.shehjkhan.workers.dev` | `https://mise-web-dev.shehjkhan.workers.dev` |
| `SANITY_STUDIO_APP_ID`      | Variable | studio (optional)   | `dhe9wg4msckhg9y2zh5y4qzf`               | set after first dev deploy (optional)        |
| `CLOUDFLARE_ACCOUNT_ID`     | Variable | web, web-dev        | Cloudflare account ID                    | same                                         |
| `SANITY_AUTH_TOKEN`         | Secret   | studio, studio-dev  | Sanity deploy token                      | same token                                   |
| `CLOUDFLARE_API_TOKEN`      | Secret   | web, web-dev        | See below                                | same                                         |
| `SANITY_API_READ_TOKEN`     | Secret   | web, web-dev (opt.) | Read token for draft mode                | optional                                     |

`SANITY_STUDIO_URL` and `SANITY_STUDIO_PREVIEW_URL` are optional when `SANITY_STUDIO_HOSTNAME` is set — CI derives `https://<hostname>.sanity.studio` if URL is omitted.

#### Cloudflare API token

Create a **new** token — error `9109` / `10000` means the token is invalid, revoked, or missing permissions.

1. Open [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token**
2. Use **Edit Cloudflare Workers** template, or create a custom token with:
   - **Account** → **Workers Scripts** → **Edit** (covers deploy and `wrangler secret put`)
   - Restrict to your account (ID `f5f04e77078fe4d629e5f5ed929bc9d9`)
3. Copy the token once — paste into GitHub **Production** secret `CLOUDFLARE_API_TOKEN` with **no trailing newline or spaces**
4. Verify locally before pushing:

```bash
export CLOUDFLARE_API_TOKEN="paste-token-here"
export CLOUDFLARE_ACCOUNT_ID="f5f04e77078fe4d629e5f5ed929bc9d9"
pnpm --filter web exec wrangler whoami
pnpm --filter web build && pnpm --filter web exec wrangler deploy --config dist/server/wrangler.json
```

If local deploy works but CI fails, re-save the GitHub secret — a bad paste is the most common cause.

## Design

See [`docs/DESIGN.md`](docs/DESIGN.md) and stitch mocks in [`docs/stitch_mise_kitchen_operating_system/`](docs/stitch_mise_kitchen_operating_system/).
