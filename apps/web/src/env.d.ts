/// <reference types="astro/client" />
/// <reference types="@sanity/astro/module" />

interface ImportMetaEnv {
  readonly SANITY_API_READ_TOKEN?: string
  readonly PUBLIC_SANITY_PROJECT_ID?: string
  readonly PUBLIC_SANITY_DATASET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare namespace App {
  interface Locals {
    /** Draft-mode queries rendered on this request, handed to Presentation live mode. */
    liveQueries?: import('./lib/sanity/live-queries').LiveQuery[]
  }
}
