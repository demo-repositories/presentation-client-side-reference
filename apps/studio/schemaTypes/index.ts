import {ingredient} from './documents/ingredient'
import {blogPost} from './documents/blog-post'
import {homePage} from './documents/home-page'
import {mealPlanEntry} from './documents/meal-plan-entry'
import {pantryCategory} from './documents/pantry-category'
import {pantrySnapshot} from './documents/pantry-snapshot'
import {recipe} from './documents/recipe'
import {recipeCategory} from './documents/recipe-category'
import {videoShowcase} from './documents/video-showcase'
import {mealPlanEntryObject} from './objects/meal-plan-entry'
import {nutritionInfo} from './objects/nutrition-info'
import {pantryItem} from './objects/pantry-item'
import {recipeIngredientLine} from './objects/recipe-ingredient-line'
import {recipeStep} from './objects/recipe-step'
import {seo} from './seo'

export const schemaTypes = [
  // Objects
  nutritionInfo,
  recipeIngredientLine,
  recipeStep,
  pantryItem,
  mealPlanEntryObject,
  seo,
  // Documents
  recipe,
  ingredient,
  recipeCategory,
  pantryCategory,
  homePage,
  mealPlanEntry,
  pantrySnapshot,
  videoShowcase,
  blogPost,
]
