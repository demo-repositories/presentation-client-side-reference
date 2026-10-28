// Re-renders the current page on the server and swaps it into the DOM in place,
// so Presentation edits show up without a full reload (no flash, scroll kept,
// visual-editing islands stay mounted).

// Must match the wrapper in BaseLayout.astro.
const PAGE_ROOT_ATTRIBUTE = 'data-page-root'

let inFlight: AbortController | undefined

export async function refreshPageInPlace(): Promise<void> {
  inFlight?.abort()
  const controller = new AbortController()
  inFlight = controller

  try {
    const res = await fetch(window.location.href, {
      cache: 'no-store',
      headers: {accept: 'text/html'},
      signal: controller.signal,
    })
    // Redirects (e.g. a renamed slug) and errors need the browser's own handling.
    if (!res.ok || res.redirected) {
      window.location.reload()
      return
    }

    const html = await res.text()
    if (controller.signal.aborted) return

    const next = new DOMParser().parseFromString(html, 'text/html')
    const selector = `[${PAGE_ROOT_ATTRIBUTE}]`
    const currentRoot = document.querySelector(selector)
    const nextRoot = next.querySelector(selector)
    if (!currentRoot || !nextRoot) {
      window.location.reload()
      return
    }

    document.title = next.title
    const description = next.querySelector('meta[name="description"]')?.getAttribute('content')
    if (description != null) {
      document.querySelector('meta[name="description"]')?.setAttribute('content', description)
    }

    // Inserted <astro-island> elements hydrate themselves on connect.
    currentRoot.replaceWith(document.adoptNode(nextRoot))
  } catch (error) {
    if (controller.signal.aborted) return
    console.error('In-place refresh failed, reloading', error)
    window.location.reload()
  } finally {
    if (inFlight === controller) inFlight = undefined
  }
}
