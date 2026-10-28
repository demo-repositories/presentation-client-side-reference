import {defineQuery} from 'groq'

// Static GROQ fragments (typegen cannot resolve dynamic helper functions).
const localizedTitle = `coalesce(title[language == $locale][0].value, title[language == "en-US"][0].value, title[0].value, title)`
const localizedRefTitle = `{ "value": coalesce(title[language == $locale][0].value, title[language == "en-US"][0].value, title[0].value, title) }.value`
const localizedIngredientName = `coalesce(ingredient->name[language == $locale][0].value, ingredient->name[language == "en-US"][0].value, ingredient->name[0].value, ingredient->name)`
const localizedCategoryTitle = `coalesce(category->title[language == $locale][0].value, category->title[language == "en-US"][0].value, category->title[0].value, category->title)`

export const HOME_PAGE_QUERY = defineQuery(`*[_type == "homePage" && language == $locale][0]{
  title,
  greeting,
  subtitle,
  quickActionLabels,
  mealsToday[]{
    _key,
    date,
    mealType,
    label,
    "recipeTitle": recipe->title,
    "recipeSlug": recipe->slug.current
  },
  featuredRecipes[]->{
    _id,
    title,
    slug,
    summary,
    prepTimeMinutes,
    cookTimeMinutes,
    heroImage
  }
}`)

export const RECIPES_QUERY = defineQuery(`*[
  _type == "recipe" &&
  language == $locale &&
  ($cuisine == "" || $cuisine in categories[]->slug.current) &&
  ($course == "" || $course in categories[]->slug.current)
] | order(title asc) {
  _id,
  title,
  slug,
  summary,
  prepTimeMinutes,
  cookTimeMinutes,
  servings,
  heroImage,
  tags,
  "categories": categories[]->${localizedRefTitle}
}`)

export const RECIPE_CATEGORIES_QUERY = defineQuery(`*[
  _type == "recipeCategory" &&
  kind in $kinds &&
  defined(slug.current)
] | order(kind asc, coalesce(sortOrder, 999) asc) {
  kind,
  "slug": slug.current,
  "title": ${localizedTitle}
}`)

export const RECIPE_BY_SLUG_QUERY =
  defineQuery(`*[_type == "recipe" && language == $locale && slug.current == $slug][0]{
  _id,
  title,
  slug,
  summary,
  prepTimeMinutes,
  cookTimeMinutes,
  servings,
  heroImage,
  tags,
  nutrition,
  ingredients[]{
    _key,
    quantity,
    unit,
    note,
    "ingredientName": ${localizedIngredientName}
  },
  steps[]{
    _key,
    instruction,
    durationMinutes,
    tip
  },
  "categories": categories[]->${localizedRefTitle}
}`)

export const PANTRY_SNAPSHOT_QUERY =
  defineQuery(`*[_type == "pantrySnapshot" && language == $locale][0]{
  title,
  description,
  items[]{
    _key,
    quantity,
    capacity,
    unit,
    location,
    expiresAt,
    "ingredientName": ${localizedIngredientName},
    "categoryTitle": ${localizedCategoryTitle}
  }
}`)

export const RECIPE_TRANSLATIONS_QUERY =
  defineQuery(`*[_type == "translation.metadata" && references($recipeId)][0]{
  translations[]{
    _key,
    "slug": value->slug.current,
    "language": value->language,
    "title": value->title
  }
}`)

export const RECIPE_SLUGS_QUERY = defineQuery(`*[_type == "recipe" && defined(slug.current)]{
  "locale": language,
  "slug": slug.current
}`)

// datasetVideo is a plain sanity.fileAsset in this dataset (normal -> join).
// streamingVideo lives in the org Media Library behind a Global Dataset Reference,
// so it must be followed with documents::get() and read with an authorized client.
export const VIDEO_SHOWCASE_QUERY = defineQuery(`*[_type == "videoShowcase"][0]{
  title,
  "datasetVideo": datasetVideo.asset->{
    url,
    mimeType,
    size,
    originalFilename
  },
  "streamingVideo": documents::get(streamingVideo.asset){
    _id,
    "aspectRatio": metadata.aspectRatio,
    "duration": metadata.duration,
    "playbackId": metadata.playbacks[policy == "public"][0]._id
  }
}`)

export const BLOG_POSTS_QUERY =
  defineQuery(`*[_type == "blogPost" && language == $locale && defined(slug.current)] | order(publishedAt desc) {
  _id,
  title,
  "slug": slug.current,
  excerpt,
  publishedAt,
  mainImage
}`)

export const BLOG_POST_BY_SLUG_QUERY =
  defineQuery(`*[_type == "blogPost" && language == $locale && slug.current == $slug][0]{
  _id,
  title,
  excerpt,
  publishedAt,
  mainImage,
  body
}`)
