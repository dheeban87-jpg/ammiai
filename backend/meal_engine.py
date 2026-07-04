"""AmmiAI deterministic meal planning engine.

Given: recipes + rules JSON + user profile + pantry snapshot + week history.
Output: a full day plan (breakfast/lunch/dinner) obeying the templates and all
avoid rules, plus per-meal + per-day nutrition totals with status chips.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

# Ingredients that most kitchens keep and shouldn't count against pantry match.
STAPLE_ALWAYS = {
    "salt",
    "sugar",
    "turmeric_powder",
    "mustard_seeds",
    "cumin_seeds",
    "asafoetida",
    "fenugreek_seeds",
    "red_chili_powder",
    "coriander_powder",
    "sambar_powder",
    "rasam_powder",
    "curry_leaves",
    "cooking_oil",
    "ghee",
}

# ---------- Static "slot fillers" that aren't real recipes ----------- #
STATIC_ITEMS: Dict[str, Dict[str, Any]] = {
    "plain_rice_130": {
        "id": "static_rice_130",
        "name_en": "Plain rice",
        "name_ta": "சாதம்",
        "category": "staple",
        "static": True,
        "qty_g": 130,
        "nutrition": {"kcal": 170, "protein_g": 3.5, "carbs_g": 37, "fat_g": 0.4, "fiber_g": 0.6},
    },
    "plain_rice_100": {
        "id": "static_rice_100",
        "name_en": "Plain rice (small)",
        "name_ta": "சாதம்",
        "category": "staple",
        "static": True,
        "qty_g": 100,
        "nutrition": {"kcal": 130, "protein_g": 2.7, "carbs_g": 28, "fat_g": 0.3, "fiber_g": 0.5},
    },
    "curd_serving": {
        "id": "static_curd",
        "name_en": "Curd (side)",
        "name_ta": "தயிர்",
        "category": "dairy",
        "static": True,
        "qty_g": 100,
        "nutrition": {"kcal": 60, "protein_g": 3, "carbs_g": 5, "fat_g": 3, "fiber_g": 0},
    },
}


@dataclass
class PantrySnapshot:
    """View of the user's pantry, keyed by ingredient_id."""
    have: Set[str] = field(default_factory=set)
    expiring: Set[str] = field(default_factory=set)  # yellow/red items

    @classmethod
    def from_items(cls, items: Sequence[Dict[str, Any]]) -> "PantrySnapshot":
        have = {it["ingredient_id"] for it in items if it.get("qty", 0) > 0}
        expiring = {
            it["ingredient_id"]
            for it in items
            if it.get("freshness") in ("yellow", "red")
        }
        return cls(have=have, expiring=expiring)


@dataclass
class PlannerContext:
    rules: Dict[str, Any]
    recipes: List[Dict[str, Any]]
    profile: Dict[str, Any]
    pantry: PantrySnapshot
    week_ids: List[str] = field(default_factory=list)  # dishes cooked this week
    seed: Optional[int] = None


# --------------------------- Scoring --------------------------- #
def _real_ingredients(recipe: Dict[str, Any]) -> List[str]:
    return [
        ing["ingredient_id"]
        for ing in recipe.get("ingredients", [])
        if ing["ingredient_id"] not in STAPLE_ALWAYS
    ]


def pantry_match(recipe: Dict[str, Any], pantry: PantrySnapshot) -> Tuple[int, int, float]:
    """Returns (available, required, ratio) counting only non-staple ingredients."""
    req = _real_ingredients(recipe)
    if not req:
        return (0, 0, 1.0)
    have = sum(1 for r in req if r in pantry.have)
    return (have, len(req), have / len(req))


def uses_expiring(recipe: Dict[str, Any], pantry: PantrySnapshot) -> List[str]:
    return [
        r for r in _real_ingredients(recipe) if r in pantry.expiring
    ]


def score_recipe(
    recipe: Dict[str, Any],
    ctx: PlannerContext,
) -> Tuple[float, Dict[str, Any]]:
    """Higher = better. Returns (score, breakdown)."""
    have, req, ratio = pantry_match(recipe, ctx.pantry)
    exp = uses_expiring(recipe, ctx.pantry)
    favs = set(ctx.profile.get("favorites", []))
    goals = set(ctx.profile.get("health", {}).get("goals", []))
    tags = set(recipe.get("health_tags", []))

    base = ratio  # 0..1
    exp_bonus = 0.25 * len(exp)
    fav_bonus = 0.20 if recipe["id"] in favs else 0
    health_bonus = 0.10 * len(goals & tags)
    zero_shop_bonus = 0.30 if ratio >= 1.0 else 0
    variety_penalty = 0.15 if recipe["id"] in ctx.week_ids else 0

    total = base + exp_bonus + fav_bonus + health_bonus + zero_shop_bonus - variety_penalty
    return (
        total,
        {
            "pantry_have": have,
            "pantry_required": req,
            "pantry_ratio": round(ratio, 3),
            "expiring_hits": exp,
            "is_favorite": recipe["id"] in favs,
            "zero_shop": ratio >= 1.0,
            "score": round(total, 3),
        },
    )


# --------------------- Filters & Avoid Rules --------------------- #
def diet_ok(recipe: Dict[str, Any], diet: str) -> bool:
    if diet == "nonveg":
        return True
    rd = recipe.get("diet", "veg")
    if diet == "eggetarian":
        return rd in ("veg", "eggetarian")
    return rd == "veg"


def allergy_ok(recipe: Dict[str, Any], allergies: Iterable[str]) -> bool:
    ings = set(_real_ingredients(recipe))
    for a in allergies:
        if a == "no_onion_garlic":
            if ings & {"onion", "shallots", "garlic"}:
                return False
        elif a == "no_coconut":
            if ings & {"coconut", "coconut_grated"}:
                return False
        elif a == "no_dairy":
            if ings & {"milk", "curd", "paneer", "ghee"}:
                return False
        elif a == "no_nuts":
            if ings & {"peanuts", "cashew", "almond"}:
                return False
    return True


def custom_avoid_ok(recipe: Dict[str, Any], custom: Iterable[str]) -> bool:
    if not custom:
        return True
    text = f"{recipe.get('name_en','')} {recipe.get('name_ta','')}".lower()
    ings = " ".join(_real_ingredients(recipe)).lower()
    for c in custom:
        c = c.strip().lower()
        if not c:
            continue
        if c in text or c in ings:
            return False
    return True


def _rules_lookup(rules: Dict[str, Any], name: str) -> Dict[str, Any]:
    for r in rules.get("avoid_rules", []):
        if r.get("rule") == name:
            return r
    return {}


def _dish_veggie(recipe: Dict[str, Any]) -> Optional[str]:
    """Heuristic: extract the 'main' vegetable from a recipe's ingredients."""
    veggie_keys = {
        "drumstick", "brinjal", "cabbage", "cauliflower", "beans", "carrot",
        "beetroot", "vazhakkai", "vendakkai", "pavakkai", "kothavarangai",
        "sorakkai", "pudalangai", "peerkangai", "poosanikai", "ash_gourd",
        "snake_gourd", "spinach_palak", "keerai_arakeerai", "keerai_pasalai",
        "potato", "tomato", "capsicum",
    }
    for ing in _real_ingredients(recipe):
        if ing in veggie_keys:
            return ing
    return None


def check_avoid_rules(
    candidate: Dict[str, Any],
    chosen_this_meal: List[Dict[str, Any]],
    day_state: Dict[str, Any],
    rules: Dict[str, Any],
    is_curd_side: bool = False,
) -> Optional[str]:
    """Returns rejection reason if candidate violates avoid rules, else None."""
    cid = candidate["id"]

    # 1) max_sour per meal (sambar+rasam exempt is handled by sambar not being in sour_ids)
    sour_rule = _rules_lookup(rules, "max_sour_dishes_per_meal")
    sour_ids = set(sour_rule.get("sour_ids", []))
    max_sour = int(sour_rule.get("value", 1))
    if cid in sour_ids:
        current_sour = sum(1 for c in chosen_this_meal if c["id"] in sour_ids)
        if current_sour >= max_sour:
            return "too_many_sour"

    # 2) max coconut heavy per meal
    coco = _rules_lookup(rules, "max_coconut_heavy_per_meal")
    coco_ids = set(coco.get("coconut_ids", []))
    max_coco = int(coco.get("value", 2))
    if cid in coco_ids:
        cur_coco = sum(1 for c in chosen_this_meal if c["id"] in coco_ids)
        if cur_coco >= max_coco:
            return "too_much_coconut"

    # 3) no curd with fish
    fish_pair = {"nv_meen_kuzhambu", "nv_meen_varuval", "nv_era_thokku"}
    if is_curd_side and any(c["id"] in fish_pair for c in chosen_this_meal):
        return "no_curd_with_fish"
    if cid in fish_pair and day_state.get("has_curd_side"):
        return "no_curd_with_fish"

    # 4) same veggie once per day
    veg = _dish_veggie(candidate)
    if veg and veg in day_state.get("veggies_used", set()):
        return "veggie_already_used_today"

    # 5) same dish max 2x per week
    week_ids = day_state.get("week_ids", [])
    if week_ids.count(cid) >= 2:
        return "already_twice_this_week"

    # 6) already in this meal
    if any(c["id"] == cid for c in chosen_this_meal):
        return "duplicate"

    return None


# --------------------- Nutrition & targets --------------------- #
def daily_targets(rules: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, float]:
    icmr = rules.get("daily_nutrition_targets_icmr", {})
    # Default sedentary adult female (more conservative). Users can override later.
    base = icmr.get("adult_female", {"kcal": 1660, "protein_g": 46, "fiber_g": 25}).copy()

    # gender heuristic — we don't ask gender in onboarding, use goal signal only
    weight = profile.get("health", {}).get("weight_kg")
    if weight:
        # 0.83 g/kg minimum for protein guard
        base["protein_g"] = max(base.get("protein_g", 46), round(0.83 * weight, 1))

    goals = set(profile.get("health", {}).get("goals", []))
    mods = icmr.get("goal_modifiers", {})
    for g in goals:
        m = mods.get(g, {})
        if "kcal_multiplier" in m:
            base["kcal"] = int(base["kcal"] * m["kcal_multiplier"])
        if "protein_g_min" in m:
            base["protein_g"] = max(base["protein_g"], m["protein_g_min"])
    return base


def sum_nutrition(items: List[Dict[str, Any]]) -> Dict[str, float]:
    total = {"kcal": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0, "fiber_g": 0.0}
    for it in items:
        n = it.get("nutrition", {}) or {}
        for k in total:
            total[k] += float(n.get(k, 0) or 0)
    return {k: round(v, 1) for k, v in total.items()}


def meal_status(meal_items: List[Dict[str, Any]], meal_key: str, rules: Dict[str, Any]) -> Dict[str, Any]:
    """Return {'chip': balanced|low_protein|heavy, 'kcal':..., 'protein_g':..., 'fiber_g':...}"""
    templates = rules.get("meal_templates", {})
    target = templates.get(meal_key, {}).get("nutrition_target", {})
    totals = sum_nutrition(meal_items)
    kcal_range = target.get("kcal", [0, 99999])
    protein_min = target.get("protein_g_min", 0)

    chip = "balanced"
    if totals["protein_g"] < protein_min:
        chip = "low_protein"
    elif totals["kcal"] > (kcal_range[1] if isinstance(kcal_range, list) else 99999):
        chip = "heavy"
    return {
        "chip": chip,
        "kcal": totals["kcal"],
        "protein_g": totals["protein_g"],
        "fiber_g": totals["fiber_g"],
        "target_kcal": kcal_range,
        "target_protein_min": protein_min,
    }


# --------------------- Candidate pool + picker --------------------- #
def eligible_pool(ctx: PlannerContext, categories: Iterable[str]) -> List[Dict[str, Any]]:
    diet = ctx.profile.get("diet", "veg")
    allergies = ctx.profile.get("allergies", []) or []
    custom = ctx.profile.get("custom_avoid", []) or []
    cats = set(categories)
    return [
        r
        for r in ctx.recipes
        if r["category"] in cats
        and diet_ok(r, diet)
        and allergy_ok(r, allergies)
        and custom_avoid_ok(r, custom)
    ]


def rank(
    ctx: PlannerContext,
    candidates: List[Dict[str, Any]],
) -> List[Tuple[Dict[str, Any], float, Dict[str, Any]]]:
    scored = []
    for r in candidates:
        s, br = score_recipe(r, ctx)
        scored.append((r, s, br))
    # Tie-break with a deterministic hash-jitter so regenerate produces variety
    rng = random.Random(ctx.seed)
    scored.sort(key=lambda x: (-x[1], rng.random()))
    return scored


def pick(
    ctx: PlannerContext,
    categories: Iterable[str],
    chosen_this_meal: List[Dict[str, Any]],
    day_state: Dict[str, Any],
    is_curd_side: bool = False,
) -> Optional[Dict[str, Any]]:
    pool = eligible_pool(ctx, categories)
    ranked = rank(ctx, pool)
    for r, _, breakdown in ranked:
        why = check_avoid_rules(r, chosen_this_meal, day_state, ctx.rules, is_curd_side)
        if why:
            continue
        out = dict(r)
        out["_score"] = breakdown
        return out
    return None


# --------------------- Meal builders --------------------- #
def _add_veggie_to_state(recipe: Dict[str, Any], day_state: Dict[str, Any]) -> None:
    v = _dish_veggie(recipe)
    if v:
        day_state.setdefault("veggies_used", set()).add(v)


def build_breakfast(ctx: PlannerContext, day_state: Dict[str, Any]) -> Dict[str, Any]:
    meal: List[Dict[str, Any]] = []
    tiffin = pick(ctx, ["tiffin"], meal, day_state)
    if tiffin:
        meal.append(tiffin)
        _add_veggie_to_state(tiffin, day_state)
    # Accompaniment (chutney/sambar). Sambar (kuzhambu) also allowed here.
    acc = pick(ctx, ["accompaniment", "kuzhambu"], meal, day_state)
    if acc:
        meal.append(acc)
        _add_veggie_to_state(acc, day_state)
    status = meal_status(meal, "breakfast", ctx.rules)
    return {"key": "breakfast", "template": "breakfast", "items": meal, **status}


def build_lunch(ctx: PlannerContext, day_state: Dict[str, Any]) -> Dict[str, Any]:
    meal: List[Dict[str, Any]] = [STATIC_ITEMS["plain_rice_130"]]

    diet = ctx.profile.get("diet", "veg")
    # Nonveg: allow replacing kuzhambu slot with a nonveg gravy up to 3x/week
    nv_gravy_count = sum(1 for i in day_state.get("week_ids", []) if i.startswith("nv_") and "kuzhambu" in i)
    if diet == "nonveg" and nv_gravy_count < 3 and random.Random(ctx.seed).random() < 0.5:
        kuz = pick(ctx, ["nonveg"], meal, day_state)
    else:
        kuz = pick(ctx, ["kuzhambu"], meal, day_state)
    if kuz:
        meal.append(kuz)
        _add_veggie_to_state(kuz, day_state)

    poriyal = pick(ctx, ["poriyal"], meal, day_state)
    if poriyal:
        meal.append(poriyal)
        _add_veggie_to_state(poriyal, day_state)

    # Optional kootu (protein-guard friendly, prefer to include)
    kootu = pick(ctx, ["kootu"], meal, day_state)
    if kootu:
        meal.append(kootu)
        _add_veggie_to_state(kootu, day_state)

    # Optional rasam
    rasam = pick(ctx, ["rasam"], meal, day_state)
    if rasam:
        meal.append(rasam)

    # Curd side (unless day already has fish gravy)
    if not any("nv_meen" in c["id"] or "nv_era" in c["id"] for c in meal):
        meal.append(STATIC_ITEMS["curd_serving"])
        day_state["has_curd_side"] = True

    status = meal_status(meal, "lunch_full", ctx.rules)
    return {"key": "lunch", "template": "lunch_full", "items": meal, **status}


def build_dinner(ctx: PlannerContext, day_state: Dict[str, Any]) -> Dict[str, Any]:
    goals = set(ctx.profile.get("health", {}).get("goals", []))
    prefer_tiffin = "weight_loss" in goals or random.Random(
        (ctx.seed or 0) + 7
    ).random() < 0.6

    meal: List[Dict[str, Any]] = []
    if prefer_tiffin:
        tiffin = pick(ctx, ["tiffin"], meal, day_state)
        if tiffin:
            meal.append(tiffin)
            _add_veggie_to_state(tiffin, day_state)
        acc = pick(ctx, ["accompaniment"], meal, day_state)
        if acc:
            meal.append(acc)
            _add_veggie_to_state(acc, day_state)
        template = "dinner_tiffin"
    else:
        meal.append(STATIC_ITEMS["plain_rice_100"])
        gravy = pick(ctx, ["rasam", "kuzhambu"], meal, day_state)
        if gravy:
            meal.append(gravy)
            _add_veggie_to_state(gravy, day_state)
        poriyal = pick(ctx, ["poriyal"], meal, day_state)
        if poriyal:
            meal.append(poriyal)
            _add_veggie_to_state(poriyal, day_state)
        template = "dinner_light_rice"

    status = meal_status(meal, template, ctx.rules)
    return {"key": "dinner", "template": template, "items": meal, **status}


# --------------------- Protein guard --------------------- #
def enforce_protein_guard(
    plan: Dict[str, Any],
    ctx: PlannerContext,
    day_state: Dict[str, Any],
) -> Dict[str, Any]:
    weight = ctx.profile.get("health", {}).get("weight_kg") or 60.0
    target = round(0.83 * float(weight), 1)

    def day_protein() -> float:
        total = 0.0
        for m in ["breakfast", "lunch", "dinner"]:
            total += sum_nutrition(plan[m]["items"])["protein_g"]
        return total

    plan["protein_target_g"] = target
    plan["protein_actual_g"] = round(day_protein(), 1)

    if plan["protein_actual_g"] >= target:
        plan["protein_guard_action"] = None
        return plan

    # Strategy: try to add a paruppu thogayal to lunch if not there.
    lunch = plan["lunch"]
    allergies = ctx.profile.get("allergies", []) or []
    custom = ctx.profile.get("custom_avoid", []) or []
    added = False
    if not any(c["id"] == "tg_paruppu" for c in lunch["items"]):
        for r in ctx.recipes:
            if r["id"] != "tg_paruppu":
                continue
            if not allergy_ok(r, allergies) or not custom_avoid_ok(r, custom):
                break
            if check_avoid_rules(r, lunch["items"], day_state, ctx.rules):
                break
            lunch["items"].append(r)
            plan.setdefault("protein_guard_actions", []).append(
                "Added paruppu thogayal to lunch for protein"
            )
            added = True
            break

    # If still short, add egg omelette for eggetarian/nonveg users at breakfast
    diet = ctx.profile.get("diet", "veg")
    if diet in ("eggetarian", "nonveg"):
        bf = plan["breakfast"]
        if not any(c["id"] == "nv_omelette" for c in bf["items"]):
            for r in ctx.recipes:
                if r["id"] != "nv_omelette":
                    continue
                if not allergy_ok(r, allergies) or not custom_avoid_ok(r, custom):
                    break
                bf["items"].append(r)
                plan.setdefault("protein_guard_actions", []).append(
                    "Added omelette to breakfast for protein"
                )
                added = True
                break

    # If we couldn't add anything (e.g., no-coconut vegetarian), leave a note
    # for the UI to render without silently violating an allergy.
    if not added and not plan.get("protein_guard_actions"):
        plan["protein_guard_actions"] = [
            "Protein slightly below target — consider a protein-rich side later",
        ]

    # Recompute statuses
    for m in ["breakfast", "lunch", "dinner"]:
        tpl = plan[m]["template"]
        plan[m].update(meal_status(plan[m]["items"], tpl, ctx.rules))

    plan["protein_actual_g"] = round(day_protein(), 1)
    return plan


# --------------------- Public entrypoints --------------------- #
def plan_day(ctx: PlannerContext) -> Dict[str, Any]:
    day_state: Dict[str, Any] = {
        "veggies_used": set(),
        "week_ids": list(ctx.week_ids),
        "has_curd_side": False,
    }
    breakfast = build_breakfast(ctx, day_state)
    lunch = build_lunch(ctx, day_state)
    dinner = build_dinner(ctx, day_state)

    plan: Dict[str, Any] = {
        "breakfast": breakfast,
        "lunch": lunch,
        "dinner": dinner,
        "generated_seed": ctx.seed,
    }
    plan = enforce_protein_guard(plan, ctx, day_state)

    # Day totals & rings
    day_items = breakfast["items"] + lunch["items"] + dinner["items"]
    totals = sum_nutrition(day_items)
    targets = daily_targets(ctx.rules, ctx.profile)
    plan["day_totals"] = totals
    plan["day_targets"] = targets
    plan["rings"] = {
        "kcal": min(1.0, round(totals["kcal"] / max(1, targets["kcal"]), 3)),
        "protein_g": min(1.0, round(totals["protein_g"] / max(1, targets["protein_g"]), 3)),
        "fiber_g": min(1.0, round(totals["fiber_g"] / max(1, targets["fiber_g"]), 3)),
    }
    return plan


def swap_options(
    ctx: PlannerContext,
    current_plan: Dict[str, Any],
    meal_key: str,
    current_recipe_id: str,
    limit: int = 3,
) -> List[Dict[str, Any]]:
    """Return up to N alternates from the same category obeying avoid rules."""
    meal = current_plan.get(meal_key)
    if not meal:
        return []
    current = next(
        (c for c in meal["items"] if c["id"] == current_recipe_id), None
    )
    if not current or current.get("static"):
        return []
    category = current["category"]

    # Build a day-state minus the item being swapped
    day_state: Dict[str, Any] = {
        "veggies_used": set(),
        "week_ids": list(ctx.week_ids),
        "has_curd_side": any(c["id"] == "static_curd" for m in ["breakfast", "lunch", "dinner"] for c in current_plan[m]["items"]),
    }
    for m in ["breakfast", "lunch", "dinner"]:
        for it in current_plan[m]["items"]:
            if it["id"] == current_recipe_id:
                continue
            v = _dish_veggie(it)
            if v:
                day_state["veggies_used"].add(v)

    chosen_here = [
        it for it in meal["items"] if it["id"] != current_recipe_id and not it.get("static")
    ]

    pool = eligible_pool(ctx, [category])
    ranked = rank(ctx, pool)
    out: List[Dict[str, Any]] = []
    for r, _, breakdown in ranked:
        if r["id"] == current_recipe_id:
            continue
        why = check_avoid_rules(r, chosen_here, day_state, ctx.rules)
        if why:
            continue
        r = dict(r)
        r["_score"] = breakdown
        out.append(r)
        if len(out) >= limit:
            break
    return out


# --------------------- "Cook now" & "Rescue" helpers --------------------- #
def cook_now(ctx: PlannerContext, limit: int = 8) -> List[Dict[str, Any]]:
    """Dishes with pantry_ratio == 1.0 (zero shopping needed)."""
    diet = ctx.profile.get("diet", "veg")
    out = []
    for r in ctx.recipes:
        if not diet_ok(r, diet):
            continue
        if not allergy_ok(r, ctx.profile.get("allergies", []) or []):
            continue
        have, req, ratio = pantry_match(r, ctx.pantry)
        if req == 0 or ratio < 1.0:
            continue
        rr = dict(r)
        rr["pantry_ratio"] = round(ratio, 3)
        rr["pantry_have"] = have
        rr["pantry_required"] = req
        rr["expiring_hits"] = uses_expiring(r, ctx.pantry)
        out.append(rr)
    out.sort(key=lambda x: (-len(x["expiring_hits"]), -x["pantry_ratio"]))
    return out[:limit]


def rescue_dishes(ctx: PlannerContext, limit: int = 8) -> List[Dict[str, Any]]:
    """Dishes that use at least one expiring pantry item."""
    if not ctx.pantry.expiring:
        return []
    diet = ctx.profile.get("diet", "veg")
    out = []
    for r in ctx.recipes:
        if not diet_ok(r, diet):
            continue
        if not allergy_ok(r, ctx.profile.get("allergies", []) or []):
            continue
        hits = uses_expiring(r, ctx.pantry)
        if not hits:
            continue
        have, req, ratio = pantry_match(r, ctx.pantry)
        rr = dict(r)
        rr["expiring_hits"] = hits
        rr["pantry_ratio"] = round(ratio, 3)
        rr["pantry_have"] = have
        rr["pantry_required"] = req
        out.append(rr)
    out.sort(key=lambda x: (-len(x["expiring_hits"]), -x["pantry_ratio"]))
    return out[:limit]
