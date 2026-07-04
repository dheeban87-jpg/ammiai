// Central ingredient/category icon map. TODO(Slice 2+): replace with custom
// illustrated images per-ingredient by swapping this file only.
import { MaterialCommunityIcons } from "@expo/vector-icons";

export type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

// Ingredient-id specific overrides.
const BY_ID: Record<string, IconName> = {
  rice: "rice",
  idli_rice: "rice",
  rice_flour: "grain",
  toor_dal: "peanut",
  urad_dal: "peanut",
  moong_dal: "peanut",
  chana_dal: "peanut",
  masoor_dal: "peanut",
  tamarind: "leaf",
  onion: "food-drumstick-off",
  shallots: "food-drumstick-off",
  tomato: "food-apple",
  potato: "food-apple",
  brinjal: "food-apple",
  drumstick: "carrot",
  ladys_finger: "carrot",
  carrot: "carrot",
  beans: "sprout",
  cabbage: "leaf",
  cauliflower: "leaf",
  capsicum: "food-apple",
  sorakkai: "food-apple",
  ash_gourd: "food-apple",
  snake_gourd: "food-apple",
  spinach_palak: "leaf",
  keerai_arakeerai: "leaf",
  keerai_pasalai: "leaf",
  coriander_leaves: "leaf",
  curry_leaves: "leaf",
  mint_leaves: "leaf",
  ginger: "carrot",
  garlic: "food-drumstick-off",
  green_chili: "chili-mild",
  coconut: "fruit-cherries",
  coconut_grated: "fruit-cherries",
  milk: "cup",
  curd: "cup",
  paneer: "cheese",
  ghee: "cup",
  cooking_oil: "bottle-tonic",
  mustard_seeds: "circle-small",
  cumin_seeds: "circle-small",
  fenugreek_seeds: "circle-small",
  asafoetida: "circle-small",
  turmeric_powder: "circle-small",
  red_chili_powder: "chili-hot",
  coriander_powder: "circle-small",
  sambar_powder: "circle-small",
  rasam_powder: "circle-small",
  salt: "shaker-outline",
  sugar: "shaker-outline",
  jaggery: "shaker-outline",
  egg: "egg",
  chicken: "food-drumstick",
  mutton: "food-steak",
  fish: "fish",
  prawns: "fish",
};

// Category fallbacks (matches shelf_life.json categories).
const BY_CATEGORY: Record<string, IconName> = {
  leafy_green: "leaf",
  vegetable: "food-apple",
  fruit: "food-apple",
  dairy: "cup",
  staple: "grain",
  lentil: "peanut",
  spice: "shaker-outline",
  condiment: "bottle-tonic",
  oil: "bottle-tonic",
  meat: "food-drumstick",
  seafood: "fish",
  egg: "egg",
  herb: "leaf",
  other: "cube-outline",
};

export function iconFor(ingredientId?: string, category?: string): IconName {
  if (ingredientId && BY_ID[ingredientId]) return BY_ID[ingredientId];
  if (category && BY_CATEGORY[category]) return BY_CATEGORY[category];
  return "cube-outline";
}

// Display grouping — collapses raw categories into user-friendly buckets.
export function groupFor(category: string): string {
  const c = category.toLowerCase();
  if (c.includes("leaf") || c === "herb") return "Leafy & Herbs";
  if (c === "vegetable" || c === "fruit") return "Vegetables";
  if (c === "dairy") return "Dairy";
  if (c === "meat" || c === "seafood" || c === "egg") return "Protein";
  if (c === "staple" || c === "lentil") return "Staples";
  if (c === "spice" || c === "condiment" || c === "oil") return "Spices & Oils";
  return "Other";
}

export const GROUP_ORDER = [
  "Leafy & Herbs",
  "Vegetables",
  "Dairy",
  "Protein",
  "Staples",
  "Spices & Oils",
  "Other",
];
