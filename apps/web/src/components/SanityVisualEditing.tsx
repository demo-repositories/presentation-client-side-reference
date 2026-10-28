import {useEffect} from 'react'
import {VisualEditingComponent} from '@sanity/astro/visual-editing/component'
import {perspectiveCookieName} from '@sanity/preview-url-secret/constants'
import type {ClientPerspective} from '@sanity/client'
import {resetLiveEdits, startLiveEdits} from '../lib/sanity/live-edit'
import {refreshPageInPlace} from '../lib/sanity/refresh-page'

function serializePerspective(perspective: ClientPerspective): string {
  return typeof perspective === 'string' ? perspective : JSON.stringify(perspective)
}

function getCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : undefined
}

function setPerspectiveCookie(perspective: ClientPerspective): boolean {
  const next = serializePerspective(perspective)
  const current = getCookie(perspectiveCookieName)
  if (current === next) return false
  document.cookie = `${perspectiveCookieName}=${encodeURIComponent(next)}; path=/; SameSite=None; Secure`
  return true
}

export default function SanityVisualEditing() {
  useEffect(() => startLiveEdits(), [])

  // History sync comes from @sanity/astro: it reports the URL to Presentation on
  // subscribe, on history changes, and optimistically on same-origin link clicks.
  return (
    <VisualEditingComponent
      onPerspectiveChange={(perspective) => {
        if (setPerspectiveCookie(perspective)) {
          resetLiveEdits()
          void refreshPageInPlace()
        }
      }}
      // Live-mode snapshots are the primary trigger (see live-edit.ts). The
      // deprecated `mutation` event still fires after each commit, so it stays as
      // a fallback for pages without live queries and as an early confirmation
      // of the committed state; refreshPageInPlace coalesces the overlap.
      refresh={() => refreshPageInPlace()}
    />
  )
}
