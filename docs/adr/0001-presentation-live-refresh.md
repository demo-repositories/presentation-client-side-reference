# ADR 0001: Faster Presentation preview refresh for the Astro site

**Status:** Accepted. Implemented on `develop` (PRs #3 and #6), 2026-10-28. Amended 2026-10-28 to use `@sanity/astro`'s `VisualEditingComponent` (decision 4) and to add optimistic text edits confirmed by the server (decision 5).

**Not yet verified:** a real Presentation session. Server-side behaviour and production impact were measured; the in-Studio live channel was not.

## Context

The web app (`apps/web`) is Astro with server-rendered `.astro` pages, deployed to Cloudflare Workers. Editors preview it inside Sanity Studio's Presentation tool.

Before this change, every edit in the Studio called `window.location.reload()` in the preview iframe (`src/components/SanityVisualEditing.tsx`). That meant:

- a full page flash and lost scroll position on every keystroke batch
- lost client-side state (for example, ticked recipe step checkboxes)
- edits typed while the page was reloading could go missing until the next edit

Constraints:

- **Astro pages can't re-render in the browser.** Only React islands can, and almost all page content is `.astro`.
- **The `mutation` refresh event is deprecated.** `@sanity/presentation-comlink` marks `source: 'mutation'` (and `livePreviewEnabled`) as deprecated; the next Studio major stops sending them in favour of loader APIs (`loader/query-listen`). A refresh-on-mutation design stops working at that upgrade.
- **The published site must not pay for preview code.** Visitors must get no extra JavaScript and no slower responses.

The problem can be solved in three layers:

1. morph freshly rendered HTML into the page instead of reloading
2. use loader live mode as the update signal
3. patch text in the DOM directly from live snapshots, with no network

Layers 1 and 2 shipped first. Layer 3 followed as decision 5, built as an optimistic update that the server then confirms.

## Decision

### 0. Upgrade `@sanity/astro` to 3.6.0

- `apps/web`: `@sanity/astro` `^3.5.1` → `^3.6.0`.
- 3.6.0 requires `@sanity/client` `^8.11.0`, so the shared pnpm catalog went from `^8.6.1` to `^8.13.0` (affects studio, web, translations-dashboard and l10n).

### 1. Refresh by morphing the page, not reloading it

`src/lib/sanity/refresh-page.ts`:

- **Fetch:** re-request `location.href` (`cache: 'no-store'`) and parse it with `DOMParser`.
- **Morph scope:** morph only the `[data-page-root]` element with **idiomorph**. In `BaseLayout.astro` that's a `display: contents` wrapper around the header and `<main>`. Visual-editing islands sit outside it and are never touched.
- **Islands:**
  - same component and same `props`: skipped, so the hydrated component keeps its state
  - changed `props`: set `ssr`, then `props`, which re-renders in place
  - different component: replaced after the morph pass
- **Head:** syncs `document.title` and the meta description.
- **Concurrency:** coalescing rather than aborting. The first call runs immediately; calls during a run mark it dirty; exactly one trailing run follows. Continuous typing keeps painting instead of cancelling every request.
- **Fallback:** a full reload on a non-OK response, a redirect (for example, a renamed slug), a missing page root, or any error.
- **Perspective switches:** `onPerspectiveChange` writes the cookie and morphs instead of reloading.
- **Step checkboxes:** `StepList.astro` uses a delegated `change` listener so swapped-in checkboxes keep working.

### 2. Drive refreshes from Presentation live mode

**Server:**

- In draft mode, `loadQuery` records each `{query, params, result, perspective}` into `Astro.locals.liveQueries`.
- Pages pass `Astro` to `getDraftModeProps` so it can reach `locals`.
- `BaseLayout.astro` writes the queries, plus `projectId`, `dataset`, `apiVersion` and `studioUrl`, into `<script type="application/json" id="sanity-live-queries">`. This is rendered only in draft mode, with `<` escaped.

**Browser** (`src/lib/sanity/live-queries.ts`, started from `SanityVisualEditing.tsx`):

- `createQueryStore({client: false, ssr: true})` + `enableLiveMode({client})` from `@sanity/core-loader`.
- `client: false` keeps the stores fetcher-less, so the tokenless browser client never fetches and never overwrites draft data. Inside Presentation, the Studio supplies results over comlink.
- One fetcher store per server query, hydrated with the server result. Recipe detail, for example, runs two queries.
- When any store's JSON differs from its last value, the snapshot goes to `live-edit.ts` (decision 5), which either patches the text or refreshes from the server.
- The deprecated `mutation` refresh still triggers a morph as a fallback. It's also an early confirmation that the edit is committed. Coalescing absorbs the overlap, and it becomes a no-op once the Studio stops sending it.

Before decision 5, every snapshot refreshed immediately, plus one **settle refresh** 1.5 s after the last change. The settle refresh existed because live snapshots arrive before the Studio commits the edit, so the immediate refetch can still render the previous Content Lake state. Decision 5 replaces the fixed timer with an explicit check.

### 3. Test content

- **Studio:** a localized `blogPost` type (rich text body with captioned inline images), with structure and Presentation routes.
- **Web:** `/:locale/blog/` and `/:locale/blog/:slug/` pages.
- **Seed:** `pnpm --filter studio seed-blog-posts` creates three en-US posts reusing recipe hero images. The longest has 112 body blocks and 21 images. The ids are fixed, so re-running replaces the posts.
- **Typegen fix:** `typegen` now passes `--force` to `sanity schema extract`; the newer CLI refuses to overwrite `schema.json` without it.

### 4. Use `@sanity/astro`'s `VisualEditingComponent`

3.6.0's `VisualEditingComponent` (`@sanity/astro/visual-editing/component`) forwards every `VisualEditingOptions` prop. `SanityVisualEditing.tsx` now renders it instead of `VisualEditing` from `@sanity/visual-editing/react`, passing only our `refresh` and `onPerspectiveChange`.

- **Removed:** our hand-written history adapter (URL sync on subscribe, `popstate`/`hashchange` and patched `pushState`/`replaceState`). The integration's default adapter does the same.
- **Gained:** the integration reports a same-origin link click to Presentation immediately rather than after the next page loads, so the Studio's URL bar and document pane follow navigation sooner.
- **Unchanged:** refresh behaviour. A custom `refresh` disables `experimental_refreshStrategy`, so the morph and live-mode triggers above still apply. Both components use the same single `@sanity/visual-editing` copy, so the bundle doesn't grow.

Other 3.6.0 features don't help this preview and were not adopted:

- **Multiple clients / `presentationClient`:** the site reads one project and dataset.
- **`sanityLoader` (content collections):** stores a snapshot of fetched content, so drafts and unsaved edits wouldn't stream into the preview.
- **`@sanity/ui` dev dedupe fix:** only affects Astro apps that embed the Studio; ours is a separate app.

### 5. Optimistic text edits, confirmed by the server

Text changes paint from the Studio's snapshot straight away. The server render then confirms them, or corrects them. This is the pattern of an optimistic UI hook such as React's `useOptimistic`, applied to server-rendered HTML. The hook itself only works inside React components, and almost all page content is `.astro`.

**Optimistic update** (`src/lib/sanity/live-edit.ts`, helpers in `optimistic-text.ts`):

- The page keeps two maps per query: the result the DOM currently shows (`rendered`, seeded from `#sanity-live-queries`) and the latest Studio snapshot (`latest`).
- On each snapshot, `diffText` compares it with `rendered`. It returns the changed strings only when nothing else differs: same shape, same array lengths, same `_id`/`_type`/`_key`/`_ref`, and every changed string carries a stega payload.
- `patchText` replaces each changed string's full stega-encoded value in the text nodes under `[data-page-root]`. Stega appends an invisible payload naming the document and field path, so `visible text + payload` is unique on the page, and server renders and snapshots encode it the same way. `<astro-island>` subtrees are skipped, because their framework owns that DOM.
- If every change was found, the update is done with no network. A confirm refetch is scheduled 400 ms after the last keystroke.
- Anything else refreshes from the server immediately, as before: new or removed blocks, images, references, non-string fields, strings without stega (slugs, URLs, dates), and strings rendered only in attributes (for example, `alt`) or transformed by a component.

**Server confirmation** (`setAfterMorph` hook in `refresh-page.ts`, which runs synchronously after each morph, before paint):

- The fetched HTML embeds the query results it was rendered with. `rendered` is reset from them.
- Each query's result is compared with its latest snapshot, with stega stripped (`stegaClean`):
  - **all equal:** the server has the edit; the morph is final
  - **server behind:** the snapshot text is re-applied in the same task, so stale text never paints; then a refetch follows after 500 ms, 1 s and 2 s
  - **still behind after three retries:** the server render stands and becomes the baseline, so a snapshot the server never reproduces doesn't restart the loop
- Perspective switches clear the snapshots first (`resetLiveEdits`), so text from the old perspective is never re-applied over the new render.

**Measured** with the pure helpers against real draft renders from `astro dev` in jsdom:

| Page                              | Stega strings | Found as page text | Simulated text edit |
| --------------------------------- | ------------- | ------------------ | ------------------- |
| Blog post (112 blocks, 21 images) | 135           | 114                | patched in 1.2 ms   |
| Recipe detail (2 queries)         | 18            | 12                 | patched in 0.3 ms   |
| Home                              | 15            | 14                 | patched in 0.4 ms   |

The strings not found as page text fall back to the server, as designed. They are image `alt` attributes, recipe categories and tags, the other locale's title in the translations query, and the home greeting. Structural edits and strings without stega were confirmed to fall back. The comparison detects an edited snapshot as "server behind" and an identical one as confirmed.

## Production impact (measured)

**Setup:** production builds of `d35916b` (before) and the change, served side by side with `astro preview`.

| Page                 | HTML size | Scripts loaded | Median response time (40 alternating runs) |
| -------------------- | --------- | -------------- | ------------------------------------------ |
| Home                 | +45 bytes | none → none    | 218 → 216 ms                               |
| Recipe detail        | +30 bytes | none → none    | 442 → 423 ms                               |
| Recipes list, pantry | +45 bytes | none → none    | within noise                               |
| Blog post (new)      | 24 KB     | none           | ~228 ms                                    |

- **HTML size:** the extra bytes are the `data-page-root` wrapper.
- **Response times:** dominated by the Sanity API round trip and vary in both directions between runs. No measurable server cost.
- **Client JS:**
  - total grows ~167 KB (1.87 MB → 2.04 MB)
  - idiomorph and core-loader live only in the `SanityVisualEditing` and `enableLiveMode` chunks
  - those chunks load only from the `client:only` island the layout renders in draft mode, so published pages load no JavaScript at all

## Consequences

**Better:**

- no reload flash; scroll, focus and unchanged island state survive edits
- plain-text edits show per keystroke without waiting for the server
- continuous typing keeps updating instead of being cancelled
- the update trigger survives the Studio dropping the `mutation` event
- the published site is unaffected

**Limits:**

- Plain-text edits in fields rendered as page text update per keystroke (about 1 ms). Everything else still waits for a server re-render (a few hundred ms).
- Brand-new blocks get no optimistic update. The Studio sends no snapshot for them until they're committed, so they appear after the server render.
- Optimistic patching relies on the server render and the snapshot carrying the same stega encoding. If they ever diverge, matches fail and edits fall back to server refreshes (today's speed), but they don't render wrongly.
- A permanently out-of-date server render costs up to three extra refetches after an edit before the server version stands.
- Portable Text edits reach the preview about once a second. The Portable Text editor batches mutations (250 ms debounce, 1 s ceiling); this is upstream and not configurable.
- Each editing burst costs at least one confirm refetch, plus retries while Content Lake catches up.
- Islands removed by a morph are never unmounted (`astro:unmount` only fires with ClientRouter). That's harmless for current islands.
- Large pages carry a large live payload in draft mode only. The 112-block blog post embeds ~255 KB, mostly stega characters. Published pages carry none.
- `[data-page-root]` is a contract between `BaseLayout.astro` and `refresh-page.ts`. Content outside it does not update on edit.

## Alternatives considered

- **Keep full reloads, with 3.6.0's `experimental_refreshStrategy: {type: 'reload', followUpDelayMs}`.** It fixes lost keystrokes but keeps the flash and the state loss, and still depends on the deprecated event.
- **Plain DOM replacement of the page root.** This was our first iteration. It's simpler, but it destroys island and form state, and aborting in-flight requests starves updates during continuous typing.
- **Convert editable pages to React islands with `@sanity/react-loader` and `useOptimistic`.** That gives true per-keystroke updates and optimistic reordering, but means rewriting the `.astro` pages and components as `.tsx` and hydrating them in draft mode. Rejected for now as too large a change.
- **Layer 3 as a one-shot patch** (patch text, morph once, re-apply the latest snapshot's text after every morph, with no follow-up check). Rejected in favour of decision 5. Without a check, a morph that fetched before the commit leaves structural changes stale until the next edit, and nothing refreshes content the tracked queries don't cover. Decision 5 compares the server render with the snapshot and retries until they match.
- **Patch reordering and removal of blocks in the DOM.** That would also avoid the network for drag-and-drop. Not done: those edits refresh from the server, which keeps the patcher small (about 200 lines across two modules). Revisit if reordering feels slow.

## Verification still to do

In a real Presentation session:

1. Type in a recipe title: no white flash.
2. Tick a step, edit step text: the checkbox stays ticked.
3. Type continuously: the preview keeps up, and the server-confirmed render lands within a few seconds of typing stopping, without the text flashing back.
4. In DevTools → Network: only a few fetch requests per typing burst, and no full page loads.
5. Repeat on `/en-us/blog/the-complete-guide-to-weeknight-meal-prep/` near the bottom of the page.
6. Click a link in the preview: the Studio's URL bar and document pane switch straight away, before the next page finishes loading.
7. Switch perspective (for example, to a release): the page morphs without a full reload.
8. Type in a recipe title or step: the text changes per keystroke, with no fetch per keystroke in DevTools → Network. One fetch follows about 400 ms after you stop, plus a retry or two until the commit lands.
9. Add a new step or reorder steps: the change appears after a server render, and the previous text doesn't flash back in.
10. Edit a recipe tag or an image's alt text: it updates via the server render, not optimistically.

## References

- `apps/web/src/lib/sanity/refresh-page.ts`, `live-queries.ts`, `live-edit.ts`, `optimistic-text.ts`, `load-query.ts`, `draft-mode.ts`
- `apps/web/src/components/SanityVisualEditing.tsx`, `apps/web/src/layouts/BaseLayout.astro`
- `@sanity/astro` 3.6.0: `VisualEditingComponent` (`@sanity/astro/visual-editing/component`) and its default history adapter
- `@sanity/presentation-comlink` `HistoryRefresh` type (deprecation notes on `mutation` and `livePreviewEnabled`)
