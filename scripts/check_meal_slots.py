#!/usr/bin/env python3
"""S1 CI guard: every recipe must carry a valid meal_slots tag + nonveg flag.
Run: python scripts/check_meal_slots.py  (exit 1 on any violation)."""
import json
import sys
from pathlib import Path

RECIPES = Path(__file__).resolve().parents[1] / "backend" / "data" / "recipes_ammiaai_v2.json"
VALID = {"breakfast", "lunch", "dinner", "snack"}


def main() -> int:
    raw = json.loads(RECIPES.read_text(encoding="utf-8"))
    recipes = raw if isinstance(raw, list) else raw.get("recipes", [])
    problems = []
    for r in recipes:
        rid = r.get("id", "?")
        slots = r.get("meal_slots")
        if not slots or not isinstance(slots, list):
            problems.append(f"{rid}: missing/empty meal_slots")
            continue
        bad = set(slots) - VALID
        if bad:
            problems.append(f"{rid}: invalid slot(s) {sorted(bad)}")
        if "nonveg" not in r:
            problems.append(f"{rid}: missing nonveg flag")
    if problems:
        print(f"FAIL — {len(problems)} recipe(s) with meal-slot issues:")
        for p in problems:
            print("  -", p)
        return 1
    print(f"OK — all {len(recipes)} recipes carry valid meal_slots + nonveg.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
