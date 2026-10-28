// Re-renders the current page on the server and morphs it into the live DOM,
// so Presentation edits show up without a full reload: no flash, scroll and
// focus kept, unchanged islands keep their state, and the visual-editing
// islands outside the page root stay mounted.

import {Idiomorph} from 'idiomorph'

// Must match the wrapper in BaseLayout.astro.
const PAGE_ROOT_SELECTOR = '[data-page-root]'

let inFlight: Promise<void> | null = null
let dirty = false
let afterMorph: ((next: Document) => void) | undefined

/**
 * Registers a callback that runs synchronously after each morph, in the same
 * task, so it can re-apply optimistic text before the browser paints.
 */
export function setAfterMorph(callback: (next: Document) => void): void {
  afterMorph = callback
}

/**
 * Refetches and morphs the page. Calls coalesce: the first runs immediately,
 * calls landing while it is in flight mark it dirty, and exactly one trailing
 * run starts when it settles. Continuous typing therefore keeps painting
 * instead of cancelling every request.
 */
export function refreshPageInPlace(): Promise<void> {
  if (inFlight) {
    dirty = true
    return inFlight
  }
  inFlight = morphFromServer().finally(() => {
    inFlight = null
    if (dirty) {
      dirty = false
      void refreshPageInPlace()
    }
  })
  return inFlight
}

async function morphFromServer(): Promise<void> {
  try {
    const res = await fetch(window.location.href, {
      cache: 'no-store',
      headers: {accept: 'text/html'},
    })
    // Redirects (e.g. a renamed slug) and errors need the browser's own handling.
    if (!res.ok || res.redirected) {
      window.location.reload()
      return
    }

    const next = new DOMParser().parseFromString(await res.text(), 'text/html')
    const currentRoot = document.querySelector(PAGE_ROOT_SELECTOR)
    const nextRoot = next.querySelector(PAGE_ROOT_SELECTOR)
    if (!currentRoot || !nextRoot) {
      window.location.reload()
      return
    }

    document.title = next.title
    const description = next.querySelector('meta[name="description"]')?.getAttribute('content')
    if (description != null) {
      document.querySelector('meta[name="description"]')?.setAttribute('content', description)
    }

    morphPageRoot(currentRoot, nextRoot)
    afterMorph?.(next)
  } catch (error) {
    console.error('In-place refresh failed, reloading', error)
    window.location.reload()
  }
}

function morphPageRoot(currentRoot: Element, nextRoot: Element) {
  const islandsToReplace: [Element, Element][] = []

  Idiomorph.morph(currentRoot, nextRoot, {
    morphStyle: 'outerHTML',
    restoreFocus: true,
    callbacks: {
      // `astro-island` elements own their subtree and are never child-morphed.
      beforeNodeMorphed(oldNode, newNode) {
        if (!isAstroIsland(oldNode) || !(newNode instanceof Element)) return true
        if (
          oldNode.getAttribute('component-url') !== newNode.getAttribute('component-url') ||
          oldNode.getAttribute('component-export') !== newNode.getAttribute('component-export')
        ) {
          // Different component: swap it after the pass (mutating mid-morph is unsafe).
          islandsToReplace.push([oldNode, newNode])
          return false
        }
        const props = newNode.getAttribute('props')
        if (props !== oldNode.getAttribute('props')) {
          // `props` is observed by the island element and re-renders the existing
          // component in place; the framework client bails unless `ssr` is set first.
          oldNode.setAttribute('ssr', '')
          if (props === null) oldNode.removeAttribute('props')
          else oldNode.setAttribute('props', props)
        }
        // Identical props: leave the hydrated component and its state untouched.
        return false
      },
    },
  })

  // Inserted <astro-island> elements hydrate themselves on connect.
  for (const [oldIsland, newIsland] of islandsToReplace) {
    oldIsland.replaceWith(document.importNode(newIsland, true))
  }
}

function isAstroIsland(node: Node): node is Element {
  return node instanceof Element && node.localName === 'astro-island'
}
