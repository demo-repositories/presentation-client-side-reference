// Pure helpers for optimistic live edits (see live-edit.ts).
//
// Text is matched by its full stega-encoded value. Stega appends an invisible
// payload naming the document and field path, so `visible text + payload` is
// unique on the page, and the server render and the Studio snapshot carry the
// same encoding. Strings without a payload (slugs, URLs, dates) are never
// patched.

import {stegaClean} from '@sanity/client/stega'

// Must match the wrapper in BaseLayout.astro.
const PAGE_ROOT_SELECTOR = '[data-page-root]'

const IDENTITY_FIELDS = new Set(['_id', '_type', '_key', '_ref'])

export type TextChange = [from: string, to: string]

function isStegaEncoded(value: string): boolean {
  return stegaClean(value) !== value
}

/**
 * Lists the string leaves that differ between two results, or `null` when they
 * differ in any other way (shape, array length, identity fields, non-strings,
 * or strings without a stega payload).
 */
export function diffText(a: unknown, b: unknown, changes: TextChange[] = []): TextChange[] | null {
  if (a === b) return changes
  if (typeof a === 'string' && typeof b === 'string') {
    if (!isStegaEncoded(a) || !isStegaEncoded(b)) return null
    changes.push([a, b])
    return changes
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return null
    for (let i = 0; i < a.length; i++) {
      if (!diffText(a[i], b[i], changes)) return null
    }
    return changes
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = Object.keys(a)
    if (keys.length !== Object.keys(b).length) return null
    for (const key of keys) {
      if (!(key in b)) return null
      if (IDENTITY_FIELDS.has(key) && a[key] !== b[key]) return null
      if (!diffText(a[key], b[key], changes)) return null
    }
    return changes
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Rewrites every occurrence of each change's old value in the page's text
 * nodes. Islands are skipped: their framework owns that DOM. Returns false if
 * any change wasn't found, so the caller falls back to the server.
 */
export function patchText(changes: TextChange[]): boolean {
  const root = document.querySelector(PAGE_ROOT_SELECTOR)
  if (!root) return false
  const textNodes: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node instanceof Element
        ? node.localName === 'astro-island'
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_SKIP
        : NodeFilter.FILTER_ACCEPT,
  })
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text)

  let allFound = true
  for (const [from, to] of changes) {
    let found = false
    for (const node of textNodes) {
      if (node.data.includes(from)) {
        node.data = node.data.replaceAll(from, to)
        found = true
      }
    }
    if (!found) allFound = false
  }
  return allFound
}
