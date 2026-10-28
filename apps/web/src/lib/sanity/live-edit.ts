// Optimistic live edits for Presentation: paint the Studio's snapshot into the
// DOM immediately, then confirm it against a server re-render.
//
// 1. Optimistic: when a snapshot changes only existing strings, rewrite the
//    matching text in place (no network). Anything else (new blocks, images,
//    non-string fields, text we can't find) refreshes from the server at once.
// 2. Confirm: refetch the page and compare the query results it was rendered
//    with (embedded in the HTML, see BaseLayout.astro) against the latest
//    snapshots. A match means the server has the edit. If the server is still
//    behind, the morph lands and the snapshot text is re-applied in the same
//    task, so stale text never paints; then it refetches with backoff.
// 3. Server wins: after the last retry, or for any difference text patching
//    can't express, the server render stands.

import {stegaClean} from '@sanity/client/stega'
import {liveQueryKey, readLiveQueries, subscribeToLiveQueries} from './live-queries'
import {diffText, patchText} from './optimistic-text'
import {refreshPageInPlace, setAfterMorph} from './refresh-page'

// Quiet period after a patched keystroke before asking the server to confirm.
const CONFIRM_DELAY_MS = 400
// Waits between refetches while the server is still behind the snapshot.
const RETRY_DELAYS_MS = [500, 1000, 2000]

/** Query results the DOM currently shows, keyed by `liveQueryKey`. */
const rendered = new Map<string, unknown>()
/** Latest Studio snapshot per query. */
const latest = new Map<string, unknown>()

let retries = 0
let confirmTimer: ReturnType<typeof setTimeout> | undefined

/** Starts optimistic live edits for the current page. Returns a cleanup function. */
export function startLiveEdits(): () => void {
  rememberRendered(document)
  setAfterMorph(reconcile)
  const unsubscribe = subscribeToLiveQueries(onSnapshot)
  return () => {
    unsubscribe()
    clearTimeout(confirmTimer)
  }
}

/**
 * Forgets the snapshots. Call before a perspective switch: they describe the
 * old perspective and must not be re-applied over the new render.
 */
export function resetLiveEdits(): void {
  latest.clear()
  retries = 0
  clearTimeout(confirmTimer)
}

function onSnapshot(key: string, result: unknown) {
  latest.set(key, result)
  retries = 0
  const changes = diffText(rendered.get(key), result)
  if (changes && patchText(changes)) {
    rendered.set(key, result)
    scheduleRefresh(CONFIRM_DELAY_MS)
    return
  }
  clearTimeout(confirmTimer)
  void refreshPageInPlace()
}

/** Runs after every morph, before paint. */
function reconcile(next: Document) {
  rememberRendered(next)
  const behind = [...latest].filter(
    ([key, snapshot]) => rendered.has(key) && !sameContent(rendered.get(key), snapshot),
  )
  if (behind.length === 0) {
    retries = 0
    return
  }
  if (retries >= RETRY_DELAYS_MS.length) {
    // Out of retries: the server render stands and becomes the baseline, so a
    // snapshot the server never reproduces doesn't restart the loop on every
    // later refresh. The next Studio snapshot replaces it as usual.
    for (const [key] of behind) latest.set(key, rendered.get(key))
    retries = 0
    return
  }
  for (const [key, snapshot] of behind) {
    const changes = diffText(rendered.get(key), snapshot)
    if (changes && patchText(changes)) rendered.set(key, snapshot)
  }
  scheduleRefresh(RETRY_DELAYS_MS[retries++])
}

function rememberRendered(doc: Document) {
  rendered.clear()
  for (const liveQuery of readLiveQueries(doc)?.queries ?? []) {
    rendered.set(liveQueryKey(liveQuery), liveQuery.result)
  }
}

function scheduleRefresh(delay: number) {
  clearTimeout(confirmTimer)
  confirmTimer = setTimeout(() => void refreshPageInPlace(), delay)
}

function sameContent(a: unknown, b: unknown): boolean {
  return JSON.stringify(stegaClean(a)) === JSON.stringify(stegaClean(b))
}
