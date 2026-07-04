// AmmiAI food emoji system — warm, instant, zero-asset-cost visuals.
// Swap this file for custom illustrated images later (same API).

const INGREDIENT_EMOJI: Record<string, string> = {
  rice: "🍚", idli_rice: "🍚", rice_flour: "🌾", poha: "🌾", rava: "🌾",
  toor_dal: "🫘", urad_dal: "🫘", moong_dal: "🫘", chana_dal: "🫘", masoor_dal: "🫘",
  chickpeas: "🫘", rajma: "🫘", wheat_flour: "🌾", besan: "🌾", millet_ragi: "🌾",
  vermicelli: "🍜", oats: "🥣", tamarind: "🟤", jaggery: "🟫", sugar: "🧂", bread: "🍞",
  onion: "🧅", shallots: "🧅", tomato: "🍅", potato: "🥔", sweet_potato: "🍠",
  brinjal: "🍆", drumstick: "🥒", ladies_finger: "🫛", ladys_finger: "🫛",
  carrot: "🥕", beetroot: "🍠", green_beans: "🫛", beans: "🫛", cabbage: "🥬",
  cauliflower: "🥦", capsicum: "🫑", bottle_gourd: "🥒", sorakkai: "🥒",
  ridge_gourd: "🥒", snake_gourd: "🥒", bitter_gourd: "🥒", ash_gourd: "🎃",
  pumpkin: "🎃", raw_banana: "🍌", cucumber: "🥒", green_peas: "🫛",
  green_chilli: "🌶️", green_chili: "🌶️", ginger: "🫚", garlic: "🧄",
  lemon: "🍋", mango_raw: "🥭", coconut: "🥥", coconut_grated: "🥥",
  spinach_palak: "🥬", keerai_arakeerai: "🥬", keerai_pasalai: "🥬",
  amaranth_keerai: "🥬", methi_leaves: "🌿", coriander_leaves: "🌿",
  curry_leaves: "🌿", mint_leaves: "🌿",
  milk: "🥛", curd: "🥛", paneer: "🧀", cheese: "🧀", butter: "🧈", ghee: "🧈",
  eggs: "🥚", chicken: "🍗", mutton: "🥩", fish: "🐟", prawns: "🦐",
  cooking_oil: "🫗", mustard_seeds: "⚫", cumin_seeds: "🟤",
};

const CATEGORY_EMOJI: Record<string, string> = {
  leafy_green: "🥬", vegetable: "🥕", dairy: "🥛", protein: "🥚",
  staple: "🌾", spice: "🧂", other: "🧺",
};

const DISH_EMOJI: Record<string, string> = {
  // static plan bases
  rice: "🍚", plain_rice: "🍚", curd: "🥛", curd_serving: "🥛",
};

const DISH_CATEGORY_EMOJI: Record<string, string> = {
  kuzhambu: "🍛", poriyal: "🥗", kootu: "🥣", rasam: "🍵", tiffin: "🫓",
  variety_rice: "🍚", nonveg: "🍗", accompaniment: "🥥",
};

const GROUP_TINT: Record<string, string> = {
  leafy_green: "#E0F2E9", vegetable: "#E8F5E9", dairy: "#FFF8E1",
  protein: "#FBE9E7", staple: "#F5EFDC", spice: "#FDF1E7", other: "#EFEDE4",
};

const DISH_TINT: Record<string, string> = {
  kuzhambu: "#FBE9E7", poriyal: "#E8F5E9", kootu: "#E0F2E9", rasam: "#FFF3E0",
  tiffin: "#FFF8E1", variety_rice: "#F5EFDC", nonveg: "#FDECEA", accompaniment: "#EFF6E9",
};

export function emojiFor(ingredientId?: string | null, category?: string | null): string {
  if (ingredientId && INGREDIENT_EMOJI[ingredientId]) return INGREDIENT_EMOJI[ingredientId];
  if (category && CATEGORY_EMOJI[category]) return CATEGORY_EMOJI[category];
  return "🧺";
}

export function tintFor(category?: string | null): string {
  return (category && GROUP_TINT[category]) || GROUP_TINT.other;
}

export function dishEmoji(dishId?: string | null, category?: string | null): string {
  if (dishId && DISH_EMOJI[dishId]) return DISH_EMOJI[dishId];
  if (category && DISH_CATEGORY_EMOJI[category]) return DISH_CATEGORY_EMOJI[category];
  return "🍽️";
}

export function dishTint(category?: string | null): string {
  return (category && DISH_TINT[category]) || "#F5EFDC";
}
