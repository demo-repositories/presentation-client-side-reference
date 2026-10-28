import {EarthGlobeIcon} from '@sanity/icons/EarthGlobe'
import {HomeIcon} from '@sanity/icons/Home'
import {withLocaleFilter} from '@starter/l10n'
import type {StructureResolver} from 'sanity/structure'

const l10nTypes = ['l10n.locale', 'l10n.glossary', 'l10n.styleGuide', 'translation.metadata']

const titleAsc = [{field: 'title', direction: 'asc'} as const]
const dateDesc = [{field: 'date', direction: 'desc'} as const]
const publishedAtDesc = [{field: 'publishedAt', direction: 'desc'} as const]
const nameAsc = [{field: 'name', direction: 'asc'} as const]

const managedDocumentTypes = [
  'recipe',
  'homePage',
  'mealPlanEntry',
  'pantrySnapshot',
  'blogPost',
  'ingredient',
  'recipeCategory',
  'pantryCategory',
  ...l10nTypes,
] as const

export const structure = ((S) =>
  S.list()
    .title('Mise')
    .items([
      S.documentTypeListItem('homePage')
        .title('Dashboard')
        .icon(HomeIcon)
        .child(() => withLocaleFilter(S.documentTypeList('homePage').defaultOrdering(titleAsc))),
      S.documentTypeListItem('recipe').child(() =>
        withLocaleFilter(S.documentTypeList('recipe').defaultOrdering(titleAsc)),
      ),
      S.documentTypeListItem('mealPlanEntry').child(() =>
        withLocaleFilter(S.documentTypeList('mealPlanEntry').defaultOrdering(dateDesc)),
      ),
      S.documentTypeListItem('pantrySnapshot').child(() =>
        withLocaleFilter(S.documentTypeList('pantrySnapshot').defaultOrdering(titleAsc)),
      ),
      S.documentTypeListItem('blogPost').child(() =>
        withLocaleFilter(S.documentTypeList('blogPost').defaultOrdering(publishedAtDesc)),
      ),
      S.divider(),
      S.documentTypeListItem('ingredient').child(
        S.documentTypeList('ingredient').defaultOrdering(nameAsc),
      ),
      S.documentTypeListItem('recipeCategory').child(
        S.documentTypeList('recipeCategory').defaultOrdering([
          {field: 'kind', direction: 'asc'},
          {field: 'sortOrder', direction: 'asc'},
        ]),
      ),
      S.documentTypeListItem('pantryCategory').child(
        S.documentTypeList('pantryCategory').defaultOrdering(titleAsc),
      ),
      S.divider(),
      S.listItem()
        .title('Localization')
        .icon(EarthGlobeIcon)
        .child(
          S.list()
            .title('Localization')
            .items(
              l10nTypes.map((type) =>
                S.documentTypeListItem(type).child(
                  type === 'translation.metadata'
                    ? S.documentTypeList(type)
                    : S.documentTypeList(type).defaultOrdering(titleAsc),
                ),
              ),
            ),
        ),
      S.divider(),
      ...S.documentTypeListItems().filter(
        (item) => !managedDocumentTypes.includes(item.getId() ?? ''),
      ),
    ])) satisfies StructureResolver
