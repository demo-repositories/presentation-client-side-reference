// @ts-check
import {defineConfig, envField} from 'astro/config'
import cloudflare from '@astrojs/cloudflare'
import react from '@astrojs/react'
import sanity from '@sanity/astro'
import {dirname, resolve} from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')

// Monorepo .env lives at repo root (see vite.envDir below).
for (const dir of [repoRoot, __dirname]) {
  for (const suffix of ['.env.local', '.env']) {
    try {
      process.loadEnvFile(resolve(dir, suffix))
    } catch {}
  }
}

const projectId =
  process.env.SANITY_STUDIO_PROJECT_ID ?? process.env.PUBLIC_SANITY_PROJECT_ID ?? '1rkupi9j'
const dataset =
  process.env.SANITY_STUDIO_DATASET ?? process.env.PUBLIC_SANITY_DATASET ?? 'production'
const studioUrl = process.env.SANITY_STUDIO_URL ?? 'http://localhost:3333'
// Release / stacked perspectives (Presentation tool) require Content Releases API (2025-02-19+).
const sanityApiVersion = '2026-06-01'

if (!projectId) {
  throw new Error(
    'Missing Sanity project ID. Set SANITY_STUDIO_PROJECT_ID or PUBLIC_SANITY_PROJECT_ID in the repo root .env',
  )
}

export default defineConfig({
  // Mise doesn't use Astro.session; disable KV sessions to avoid SESSION binding on Workers.
  session: {
    driver: {
      entrypoint: 'unstorage/drivers/null',
    },
  },
  env: {
    schema: {
      SANITY_API_READ_TOKEN: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
    },
  },
  output: 'server',
  adapter: cloudflare({
    imageService: 'cloudflare',
  }),
  integrations: [
    sanity({
      projectId,
      dataset,
      useCdn: false,
      apiVersion: sanityApiVersion,
      stega: {
        studioUrl,
      },
    }),
    react(),
  ],
  i18n: {
    defaultLocale: 'en-US',
    locales: ['en-US', 'hi-IN'],
    routing: {
      prefixDefaultLocale: true,
    },
  },
  vite: {
    envDir: '../../',
    optimizeDeps: {
      include: [
        'react/compiler-runtime',
        'lodash/isObject.js',
        'lodash/groupBy.js',
        'lodash/keyBy.js',
        'lodash/partition.js',
        'lodash/sortedIndex.js',
      ],
    },
  },
})
