/** Core data model for RecipeBox. Everything here is plain JSON so it can be stored and shared. */

export type Ingredient = {
  id: string;
  /** Optional group heading, e.g. "For the sauce". */
  section: string | null;
  /** The full line as it should be displayed, e.g. "2 cups yellow onion, diced". */
  text: string;
  /** The thing you'd buy, e.g. "yellow onion". Used as the shopping-list item name. */
  item: string;
  /** Amount + unit as written, e.g. "2 cups". */
  quantity: string | null;
};

export type Step = {
  id: string;
  section: string | null;
  text: string;
};

export type MediaKind = 'image' | 'video';

export type Media = {
  id: string;
  kind: MediaKind;
  /** Path relative to the app's media folder. App container paths change between installs, so never store absolute URIs. */
  localPath: string | null;
  /** Original web address, if the media came from (or lives on) the web. */
  remoteUrl: string | null;
  caption: string | null;
};

export type RecipeSourceType = 'camera' | 'photos' | 'web' | 'text' | 'manual' | 'shared';

export type RecipeSource = {
  type: RecipeSourceType;
  url: string | null;
  /** Site name, cookbook, or person ("Grandma Jean"). */
  name: string | null;
};

export type Recipe = {
  id: string;
  title: string;
  description: string | null;
  servings: string | null;
  prepTime: string | null;
  cookTime: string | null;
  totalTime: string | null;
  ingredients: Ingredient[];
  steps: Step[];
  notes: string | null;
  tags: string[];
  source: RecipeSource;
  media: Media[];
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
};

/** A recipe without app-assigned fields, as produced by Claude or the editor. */
export type RecipeDraft = Omit<Recipe, 'id' | 'media' | 'favorite' | 'createdAt' | 'updatedAt'> & {
  /** Web media found alongside the recipe, to be downloaded/attached on save. */
  candidateMedia?: { kind: MediaKind; url: string }[];
};
