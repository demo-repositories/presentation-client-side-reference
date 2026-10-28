# ADR 0001: Faster Presentation preview refresh for the Astro site

**Status:** Accepted. Implemented on `develop` (PRs #3 and #6), 2026-10-28. Amended 2026-10-28 to use `@sanity/astro`'s `VisualEditingComponent` (decision 4).

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

We adopted layers 1 and 2. Layer 3 was deferred (see Alternatives).

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
- When any store's JSON differs from its last value, `refreshPageForLiveEdit()` runs:
  - refresh immediately
  - one **settle refresh** 1.5 s after the last change, because live snapshots arrive before the Studio commits the edit, so the immediate refetch can still render the previous Content Lake state
- The deprecated `mutation` refresh still triggers a morph as a fallback. Coalescing absorbs the overlap, and it becomes a no-op once the Studio stops sending it.

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
- continuous typing keeps updating instead of being cancelled
- the update trigger survives the Studio dropping the `mutation` event
- the published site is unaffected

**Limits:**

- Each update still waits for a server re-render (a few hundred ms). Text does not change per keystroke; that needs layer 3.
- Portable Text edits reach the preview about once a second. The Portable Text editor batches mutations (250 ms debounce, 1 s ceiling); this is upstream and not configurable.
- The settle refresh adds one extra fetch per editing burst.
- Islands removed by a morph are never unmounted (`astro:unmount` only fires with ClientRouter). That's harmless for current islands.
- Large pages carry a large live payload in draft mode only. The 112-block blog post embeds ~255 KB, mostly stega characters. Published pages carry none.
- `[data-page-root]` is a contract between `BaseLayout.astro` and `refresh-page.ts`. Content outside it does not update on edit.

## Alternatives considered

- **Keep full reloads, with 3.6.0's `experimental_refreshStrategy: {type: 'reload', followUpDelayMs}`.** It fixes lost keystrokes but keeps the flash and the state loss, and still depends on the deprecated event.
- **Plain DOM replacement of the page root.** This was our first iteration. It's simpler, but it destroys island and form state, and aborting in-flight requests starves updates during continuous typing.
- **Convert editable pages to React islands with `@sanity/react-loader` and `useOptimistic`.** That gives true per-keystroke updates and optimistic reordering, but means rewriting the `.astro` pages and components as `.tsx` and hydrating them in draft mode. Rejected for now as too large a change.
- **Layer 3: patch text from snapshots, keyed by stega payload** (roughly 550 lines). Makes typing in existing text apply in 1–2 ms with no network. Deferred: it's large and fragile (it depends on stega encoding matching between server and browser clients) and doesn't help new blocks. Revisit if typing latency is still the main complaint once 1 and 2 are verified in Presentation.

## Verification still to do

In a real Presentation session:

1. Type in a recipe title: no white flash.
2. Tick a step, edit step text: the checkbox stays ticked.
3. Type continuously: the preview keeps up, and the final text lands about 1.5 s after typing stops.
4. In DevTools → Network: only a few fetch requests per typing burst, and no full page loads.
5. Repeat on `/en-us/blog/the-complete-guide-to-weeknight-meal-prep/` near the bottom of the page.
6. Click a link in the preview: the Studio's URL bar and document pane switch straight away, before the next page finishes loading.
7. Switch perspective (for example, to a release): the page morphs without a full reload.

## References

- `apps/web/src/lib/sanity/refresh-page.ts`, `live-queries.ts`, `load-query.ts`, `draft-mode.ts`
- `apps/web/src/components/SanityVisualEditing.tsx`, `apps/web/src/layouts/BaseLayout.astro`
- `@sanity/astro` 3.6.0: `VisualEditingComponent` (`@sanity/astro/visual-editing/component`) and its default history adapter
- `@sanity/presentation-comlink` `HistoryRefresh` type (deprecation notes on `mutation` and `livePreviewEnabled`)
