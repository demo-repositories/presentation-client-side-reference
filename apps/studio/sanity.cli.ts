import {defineCliConfig} from 'sanity/cli'
import path from 'node:path'

const repoRoot = `${__dirname}/../..`

// Load env files — highest priority first (loadEnvFile won't overwrite).
// Matches Vite's precedence: .env.local > .env, workspace > root.
for (const dir of [__dirname, repoRoot]) {
  for (const suffix of ['.env.local', '.env']) {
    try {
      process.loadEnvFile(`${dir}/${suffix}`)
    } catch {}
  }
}

const appId = process.env.SANITY_STUDIO_APP_ID?.trim()

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID ?? '1rkupi9j',
    dataset: process.env.SANITY_STUDIO_DATASET ?? 'production',
  },
  mediaLibrary: {
    aspectsPath: 'aspects',
  },
  reactCompiler: {
    target: '19',
  },
  reactStrictMode: true,
  vite: {
    envDir: repoRoot,
    resolve: {
      alias: [
        {
          // @sanity/icons v5 removed barrel exports; legacy plugins still import from '@sanity/icons'.
          find: /^@sanity\/icons$/,
          replacement: path.resolve(__dirname, 'lib/sanity-icons-barrel.ts'),
        },
      ],
    },
    server: {
      open: process.env.SANITY_STUDIO_SERVER_OPEN === 'true',
    },
  },
  deployment: {
    autoUpdates: Boolean(appId),
    ...(appId ? {appId} : {}),
  },
  typegen: {
    enabled: true,
    path: [
      './src/**/*.{ts,tsx}',
      '../../packages/l10n/src/**/*.{ts,tsx}',
      '../translations-dashboard/src/**/*.{ts,tsx}',
      '../web/src/**/*.{ts,tsx}',
      '../../functions/*/index.ts',
    ],
    generates: '../../packages/sanity-types/sanity.types.ts',
  },
})
