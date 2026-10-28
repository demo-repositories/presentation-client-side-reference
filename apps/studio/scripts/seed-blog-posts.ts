/**
 * Seeds long, image-heavy en-US blog posts for exercising visual-editing
 * refresh performance. Reuses existing recipe hero images (no uploads) and
 * uses fixed ids, so re-running replaces the posts instead of duplicating them.
 *
 *   pnpm --filter studio seed-blog-posts
 */
import {getCliClient} from 'sanity/cli'

const client = getCliClient({apiVersion: '2026-06-01'})

const LANGUAGE = 'en-US'

interface SectionSeed {
  heading: string
  paragraphs: string[]
  list?: string[]
  quote?: string
}

interface PostSeed {
  slug: string
  title: string
  excerpt: string
  publishedAt: string
  /** How many times the section set is repeated to build a long body. */
  rounds: number
}

const sections: SectionSeed[] = [
  {
    heading: 'Start with a plan, not a recipe',
    paragraphs: [
      'Most weeknight stress comes from deciding what to cook at six in the evening. A short plan written on Sunday removes that decision entirely and lets you shop once instead of three times.',
      'Pick three anchor meals, one flexible night for leftovers, and one night where you cook something new. The new dish keeps the week interesting without putting every dinner at risk.',
    ],
    list: [
      'Check what is already in the pantry before writing the list',
      'Group ingredients by store section to shop faster',
      'Choose one grain and one legume to cook in bulk',
    ],
  },
  {
    heading: 'Prep components, not meals',
    paragraphs: [
      'Cooking five complete meals on a Sunday sounds efficient but usually ends with tired food by Thursday. Prepping components keeps flavours fresh and lets you assemble different dishes from the same base.',
      'Roast a tray of vegetables, cook a pot of rice or lentils, make one sauce, and wash your greens. Those four things cover bowls, wraps, pasta and quick curries for most of the week.',
    ],
    quote: 'A good mise en place is half the dish. The other half is restraint.',
  },
  {
    heading: 'Season in layers',
    paragraphs: [
      'Salt added at the start of cooking seasons the food; salt added at the end seasons the surface. Using both gives depth without making the dish taste salty.',
      'Acid works the same way. A splash of vinegar in a braise brightens it, and a squeeze of lemon right before serving makes the whole plate taste more alive.',
    ],
    list: [
      'Bloom whole spices in fat before adding aromatics',
      'Taste after every major addition, not only at the end',
      'Finish with something fresh: herbs, citrus zest or chilli oil',
    ],
  },
  {
    heading: 'Store it so you will actually eat it',
    paragraphs: [
      'Clear containers on eye-level shelves get eaten; opaque tubs at the back of the fridge become science experiments. Label everything with the date it was cooked.',
      'Keep sauces separate from grains and greens separate from anything wet. Assembling at the last minute keeps textures crisp and stops the whole box from turning soggy.',
    ],
  },
  {
    heading: 'Use the freezer as a pantry',
    paragraphs: [
      'Stocks, cooked beans, flatbreads, ginger-garlic paste and portioned sauces all freeze well. Freezing in flat bags means they thaw in minutes and stack neatly.',
      'Once a month, cook a double batch of something freezer-friendly. Future you will be grateful on the evening everything goes wrong.',
    ],
    quote: 'The best meal plan is the one that survives a bad Wednesday.',
  },
]

const posts: PostSeed[] = [
  {
    slug: 'the-complete-guide-to-weeknight-meal-prep',
    title: 'The Complete Guide to Weeknight Meal Prep',
    excerpt:
      'A long-form guide to planning, prepping and storing a week of home-cooked dinners, with plenty of photos along the way.',
    publishedAt: '2026-10-20T09:00:00.000Z',
    rounds: 4,
  },
  {
    slug: 'building-a-pantry-that-cooks-for-you',
    title: 'Building a Pantry That Cooks for You',
    excerpt:
      'The staples, spices and freezer habits that turn a half-empty fridge into a proper dinner.',
    publishedAt: '2026-10-12T09:00:00.000Z',
    rounds: 2,
  },
  {
    slug: 'season-like-a-chef',
    title: 'Season Like a Chef',
    excerpt: 'Salt, acid, fat and heat: a practical look at layering flavour in everyday cooking.',
    publishedAt: '2026-10-02T09:00:00.000Z',
    rounds: 1,
  },
]

let keyCounter = 0
function key() {
  keyCounter += 1
  return `k${keyCounter.toString(36).padStart(5, '0')}`
}

function textBlock(text: string, style = 'normal') {
  return {
    _type: 'block',
    _key: key(),
    style,
    markDefs: [],
    children: [{_type: 'span', _key: key(), text, marks: []}],
  }
}

function listItem(text: string) {
  return {...textBlock(text), listItem: 'bullet', level: 1}
}

type ImageValue = {asset: {_ref: string; _type: 'reference'}; media?: unknown}

function imageBlock(image: ImageValue, alt: string, caption: string) {
  return {_type: 'image', _key: key(), asset: image.asset, media: image.media, alt, caption}
}

function buildBody(rounds: number, images: {title: string; image: ImageValue}[]) {
  const body: unknown[] = []
  let imageIndex = 0
  for (let round = 0; round < rounds; round++) {
    for (const section of sections) {
      const heading = round === 0 ? section.heading : `${section.heading} (part ${round + 1})`
      body.push(textBlock(heading, 'h2'))
      const [first, ...rest] = section.paragraphs
      body.push(textBlock(first))
      const {title, image} = images[imageIndex % images.length]
      imageIndex += 1
      body.push(imageBlock(image, title, `${title}, from the Mise recipe collection`))
      for (const paragraph of rest) body.push(textBlock(paragraph))
      if (section.list) body.push(...section.list.map(listItem))
      if (section.quote) body.push(textBlock(section.quote, 'blockquote'))
    }
  }
  return body
}

async function main() {
  const images = await client.fetch<{title: string; image: ImageValue}[]>(
    `*[_type == "recipe" && language == $language && defined(heroImage.asset)] | order(title asc){
      title,
      "image": heroImage{asset, media}
    }`,
    {language: LANGUAGE},
  )
  if (images.length === 0) throw new Error('No recipe hero images found to reuse')

  const transaction = client.transaction()
  posts.forEach((post, index) => {
    keyCounter = 0
    const main = images[index % images.length]
    transaction.createOrReplace({
      _id: `blogPost-${LANGUAGE}-${post.slug}`,
      _type: 'blogPost',
      language: LANGUAGE,
      title: post.title,
      slug: {_type: 'slug', current: post.slug},
      excerpt: post.excerpt,
      publishedAt: post.publishedAt,
      mainImage: {_type: 'image', ...main.image, alt: main.title},
      body: buildBody(post.rounds, images),
    })
  })

  const result = await transaction.commit()
  console.log(`Seeded ${posts.length} blog posts (transaction ${result.transactionId})`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
