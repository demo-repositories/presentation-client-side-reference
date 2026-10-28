// Presentation live mode for server-rendered pages. Inside Presentation the
// Studio pushes each query's result (including unsaved edits) to the page over
// comlink via @sanity/core-loader. Astro pages can't re-render from that data
// in the browser, so a changed snapshot is the signal to refresh the page.
// This replaces the deprecated `mutation` refresh event as the update trigger.

import {createClient, type ClientPerspective, type QueryParams} from '@sanity/client'
import {createQueryStore} from '@sanity/core-loader'

export const LIVE_QUERIES_ELEMENT_ID = 'sanity-live-queries'

export interface LiveQuery {
  query: string
  params: QueryParams
  result: unknown
  perspective: ClientPerspective
}

export interface LiveQueriesPayload {
  projectId?: string
  dataset?: string
  apiVersion?: string
  studioUrl: string
  queries: LiveQuery[]
}

/**
 * Subscribes to every draft query the server rendered this page with and calls
 * `onChange` whenever the Studio reports a different result for any of them.
 * Returns a cleanup function.
 */
export function subscribeToLiveQueries(onChange: () => void): () => void {
  const raw = document.getElementById(LIVE_QUERIES_ELEMENT_ID)?.textContent
  if (!raw) return () => undefined
  const payload: LiveQueriesPayload = JSON.parse(raw)

  // Mirrors the server draft client, minus the token: inside Presentation the
  // Studio's comlink fetcher supplies the data, never this client. Stega keeps
  // snapshots byte-comparable with the server-rendered results.
  const client = createClient({
    projectId: payload.projectId,
    dataset: payload.dataset,
    apiVersion: payload.apiVersion,
    useCdn: false,
    perspective: payload.queries[0]?.perspective ?? 'drafts',
    stega: {enabled: true, studioUrl: payload.studioUrl},
  })

  // `client: false` + `ssr: true` keeps the stores fetcher-less until live mode
  // connects, so the tokenless browser client never overwrites draft data.
  const {createFetcherStore, enableLiveMode} = createQueryStore({client: false, ssr: true})
  const disableLiveMode = enableLiveMode({client})

  const unsubscribers = payload.queries.map(({query, params, result, perspective}) => {
    let baseline = JSON.stringify(result)
    const store = createFetcherStore(query, params, {data: result, perspective})
    return store.subscribe((snapshot) => {
      if (snapshot.data === undefined) return
      const next = JSON.stringify(snapshot.data)
      if (next === baseline) return
      baseline = next
      onChange()
    })
  })

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe()
    disableLiveMode()
  }
}
