import type {AstroCookies} from 'astro'
import {perspectiveCookieName} from '@sanity/preview-url-secret/constants'

export function getDraftModeProps({
  cookies,
  locals,
}: {
  cookies: AstroCookies | undefined
  locals: App.Locals
}) {
  const perspectiveCookie = cookies?.get(perspectiveCookieName)?.value ?? undefined
  // Draft-mode queries are recorded so the layout can hand them to the browser
  // for Presentation live mode (see live-queries.ts).
  if (perspectiveCookie) locals.liveQueries ??= []
  return {
    perspectiveCookie,
    liveQueries: perspectiveCookie ? locals.liveQueries : undefined,
  }
}
