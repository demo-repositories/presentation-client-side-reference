import {stegaClean} from '@sanity/client/stega'

export const LOCALES = ['en-US', 'hi-IN'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en-US'

/** URL path segment for each locale (Astro i18n lowercases BCP-47 tags in URLs). */
export function localePathSegment(locale: Locale): string {
  return locale.toLowerCase()
}

export function localeFromParam(value: string | undefined): Locale | undefined {
  if (!value) return undefined
  return LOCALES.find((locale) => locale.toLowerCase() === value.toLowerCase())
}

export function isLocale(value: string): value is Locale {
  return localeFromParam(value) !== undefined
}

export function localizedValue<T extends {language?: string; _key?: string; value?: unknown}>(
  entries: T[] | string | null | undefined,
  locale: string,
  fallback = DEFAULT_LOCALE,
) {
  if (typeof entries === 'string') return entries || undefined
  if (!entries?.length) return undefined
  return (
    entries.find((entry) => entry.language === locale || entry._key === locale)?.value ??
    entries.find((entry) => entry.language === fallback || entry._key === fallback)?.value ??
    entries[0]?.value
  )
}

export function formatMinutes(minutes?: number | null, locale = 'en-US') {
  if (!minutes) return undefined
  if (minutes < 60) return locale === 'hi-IN' ? `${minutes} मिनट` : `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (locale === 'hi-IN') {
    return mins ? `${hours} घंटे ${mins} मिनट` : `${hours} घंटे`
  }
  return mins ? `${hours}h ${mins}m` : `${hours}h`
}

export function formatPublishedDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {year: 'numeric', month: 'long', day: 'numeric'}).format(
    new Date(stegaClean(value)),
  )
}
