import {createClient} from '@sanity/client'
import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {presentationTool} from 'sanity/presentation'
import {assist} from '@sanity/assist'
import {visionTool} from '@sanity/vision'
import {agentContextPlugin} from '@sanity/agent-context/studio'
import {createL10n, useTranslateFieldAction} from '@starter/l10n'
import {schemaTypes} from './schemaTypes'
import {MiseIcon} from './components/MiseIcon'
import {readEnvUrl, uniqueUrls} from './lib/env-url'
import {isDevStudio} from './lib/studio-env'
import {resolve} from './lib/resolve'
import {structure} from './lib/structure'

const localPreviewUrl = 'http://localhost:4321'
const productionPreviewUrl = 'https://mise-web.shehjkhan.workers.dev'
const devPreviewUrl = 'https://mise-web-dev.shehjkhan.workers.dev'
// `sanity dev` previews the local Astro app. Built and deployed Studios can't
// reach localhost, so without an explicit SANITY_STUDIO_PREVIEW_URL they
// preview the dev worker.
const previewUrl = readEnvUrl(
  process.env.SANITY_STUDIO_PREVIEW_URL,
  import.meta.env?.DEV ? localPreviewUrl : devPreviewUrl,
)
const previewInitialUrl = `${previewUrl.replace(/\/$/, '')}/en-us/`
// Allow iframe preview from local, dev, and production Astro apps.
const studioPreviewOrigins = uniqueUrls(
  previewUrl,
  localPreviewUrl,
  devPreviewUrl,
  productionPreviewUrl,
)

const localizedDocumentTypes = [
  'recipe',
  'homePage',
  'mealPlanEntry',
  'pantrySnapshot',
  'blogPost',
] as const

const fieldLocalizedDocumentTypes = ['ingredient', 'recipeCategory', 'pantryCategory'] as const

const projectId =
  import.meta.env?.SANITY_STUDIO_PROJECT_ID ?? process.env.SANITY_STUDIO_PROJECT_ID ?? 'jyyuozra'
const dataset =
  import.meta.env?.SANITY_STUDIO_DATASET ?? process.env.SANITY_STUDIO_DATASET ?? 'production'

// Schema extract runs in a headless worker — skip browser-only / network plugins there.
const isSchemaExtract = process.env.SANITY_SCHEMA_EXTRACT === '1'

const l10n = createL10n({
  localizedSchemaTypes: [...localizedDocumentTypes],
  fieldLocalizedSchemaTypes: [...fieldLocalizedDocumentTypes],
  defaultLanguage: 'en-US',
})

export default defineConfig({
  name: 'default',
  title: isDevStudio() ? 'Mise Kitchen OS (Dev)' : 'Mise Kitchen OS',
  ...(isSchemaExtract ? {} : {icon: MiseIcon}),

  projectId,
  dataset,

  // Registers the sanity.video type used by defineVideoField, so it must stay
  // enabled during schema extract too.
  mediaLibrary: {
    enabled: true,
  },

  ...(isSchemaExtract
    ? {}
    : {
        form: {
          image: {
            assetSources: (sources) => sources.filter((source) => source.name !== 'sanity-default'),
          },
        },
        unstable_clientFactory: (options) =>
          createClient({
            ...options,
            requestTagPrefix: `${options.requestTagPrefix}.mise`,
          }),
        document: {
          newDocumentOptions: (prev) =>
            prev.filter(
              (option) =>
                option.templateId !== 'translation.metadata' &&
                option.templateId !== 'fieldTranslation.metadata',
            ),
        },
      }),

  plugins: isSchemaExtract
    ? [l10n.plugin]
    : [
        structureTool({structure}),
        presentationTool({
          resolve,
          previewUrl: {
            initial: previewInitialUrl,
            previewMode: {
              enable: '/api/draft-mode/enable',
              disable: '/api/draft-mode/disable',
            },
          },
          allowOrigins: studioPreviewOrigins,
        }),
        visionTool(),
        agentContextPlugin(),
        l10n.plugin,
        assist({
          fieldActions: {
            title: 'Translate',
            useFieldActions: useTranslateFieldAction,
          },
        }),
      ],

  schema: {
    types: l10n.injectLanguageField(schemaTypes),
  },
})
