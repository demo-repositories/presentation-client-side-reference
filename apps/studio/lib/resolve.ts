import {defineDocuments, defineLocations} from 'sanity/presentation'
import type {PresentationPluginOptions} from 'sanity/presentation'

function localePath(language?: string | null) {
  return (language ?? 'en-US').toLowerCase()
}

export const mainDocuments = defineDocuments([
  {
    route: '/:locale/recipes/:slug',
    filter: `_type == "recipe" && slug.current == $slug && lower(language) == $locale`,
  },
  {
    route: '/:locale/blog/:slug',
    filter: `_type == "blogPost" && slug.current == $slug && lower(language) == $locale`,
  },
  {
    route: '/:locale/blog',
    filter: `_type == "blogPost" && lower(language) == $locale`,
  },
  {
    route: '/:locale/pantry',
    filter: `_type == "pantrySnapshot" && lower(language) == $locale`,
  },
  {
    route: '/:locale/recipes',
    filter: `_type == "recipe" && lower(language) == $locale`,
  },
  {
    route: '/:locale',
    filter: `_type == "homePage" && lower(language) == $locale`,
  },
])

export const resolve: PresentationPluginOptions['resolve'] = {
  mainDocuments,
  locations: {
    recipe: defineLocations({
      select: {
        title: 'title',
        slug: 'slug.current',
        language: 'language',
      },
      resolve: (doc) => ({
        locations: [
          {
            title: doc?.title || 'Recipe',
            href: `/${localePath(doc?.language)}/recipes/${doc?.slug}/`,
          },
          {
            title: 'Recipe directory',
            href: `/${localePath(doc?.language)}/recipes/`,
          },
        ],
      }),
    }),
    blogPost: defineLocations({
      select: {
        title: 'title',
        slug: 'slug.current',
        language: 'language',
      },
      resolve: (doc) => ({
        locations: [
          {
            title: doc?.title || 'Blog post',
            href: `/${localePath(doc?.language)}/blog/${doc?.slug}/`,
          },
          {
            title: 'Blog',
            href: `/${localePath(doc?.language)}/blog/`,
          },
        ],
      }),
    }),
    homePage: defineLocations({
      select: {
        greeting: 'greeting',
        language: 'language',
      },
      resolve: (doc) => ({
        locations: [
          {
            title: doc?.greeting || 'Dashboard',
            href: `/${localePath(doc?.language)}/`,
          },
        ],
      }),
    }),
    pantrySnapshot: defineLocations({
      select: {
        title: 'title',
        language: 'language',
      },
      resolve: (doc) => ({
        locations: [
          {
            title: doc?.title || 'Pantry',
            href: `/${localePath(doc?.language)}/pantry/`,
          },
        ],
      }),
    }),
    mealPlanEntry: defineLocations({
      select: {
        label: 'label',
        mealType: 'mealType',
        date: 'date',
        language: 'language',
      },
      resolve: (doc) => ({
        locations: [
          {
            title: doc?.label || doc?.mealType || 'Meal plan',
            href: `/${localePath(doc?.language)}/`,
          },
        ],
      }),
    }),
  },
}
