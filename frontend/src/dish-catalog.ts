// Client-side dish catalog for the Add-Dish sheet.
//
// Why: the sheet previously listed dishes via /api/plan/add-dish-options,
// a newer endpoint — if the deployed backend is even one version behind,
// the call 404s and the sheet shows an empty "No dishes match" dead end.
// /api/recipes has existed since slice 1 and is guaranteed live, so we
// fetch the full catalog once, cache it in memory, and search locally.
// Bonus: search is instant (zero network per keystroke).
import { api } from "@/src/api";
import type { MealItem } from "@/src/components/meal-card";

export type CatalogRecipe = MealItem & {
  diet?: string;
  ingredients?: { ingredient_id: string }[];
};

let _cache: CatalogRecipe[] | null = null;
let _inflight: Promise<CatalogRecipe[]> | null = null;

export async function loadDishCatalog(): Promise<CatalogRecipe[]> {
  if (_cache) return _cache;
  if (_inflight) return _inflight;
  _inflight = api
    .get<CatalogRecipe[]>("/api/recipes")
    .then((recipes) => {
      _cache = recipes;
      _inflight = null;
      return recipes;
    })
    .catch((e) => {
      _inflight = null;
      throw e;
    });
  return _inflight;
}

/** Filter the catalog by the user's diet + free-text query. */
export function filterDishes(
  all: CatalogRecipe[],
  opts: { q?: string; diet?: string | null; allergies?: string[] | null },
): CatalogRecipe[] {
  const q = (opts.q ?? "").trim().toLowerCase();
  const diet = opts.diet ?? null;
  const allergies = new Set(opts.allergies ?? []);
  const out = all.filter((r) => {
    if (diet === "veg" && r.diet !== "veg") return false;
    if (diet === "egg" && r.diet !== "veg" && r.diet !== "egg") return false;
    if (allergies.size > 0) {
      const ids = new Set((r.ingredients ?? []).map((i) => i.ingredient_id));
      for (const a of allergies) {
        if (ids.has(a)) return false;
      }
    }
    if (!q) return true;
    return (
      r.name_en.toLowerCase().includes(q) ||
      (r.name_ta ? r.name_ta.toLowerCase().includes(q) : false)
    );
  });
  out.sort((a, b) => a.name_en.localeCompare(b.name_en));
  return out;
}

/** Invalidate the cache (call after creating a custom dish). */
export function clearDishCatalog(): void {
  _cache = null;
}
