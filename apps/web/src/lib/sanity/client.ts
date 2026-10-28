import {createImageUrlBuilder} from '@sanity/image-url'
import {sanityClient} from 'sanity:client'
import type {SanityImageSource} from '@sanity/image-url'

function getBuilder() {
  return createImageUrlBuilder(sanityClient)
}

export function urlFor(source: SanityImageSource | null | undefined) {
  if (!source) return null
  return getBuilder().image(source).auto('format').fit('max')
}

export function imageUrl(
  source: SanityImageSource | null | undefined,
  width = 800,
  height?: number,
) {
  const img = urlFor(source)
  if (!img) return undefined
  return height ? img.width(width).height(height).url() : img.width(width).url()
}
