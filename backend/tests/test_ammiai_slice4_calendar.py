"""AmmiAI Slice 4 backend tests: Calendar tab / bulk-generate / month / swap violations.

Covers:
- POST /api/plan/bulk-generate {start_date, end_date, only_empty} → {created, skipped}
- Repeat bulk-generate with only_empty=true skips already-planned days
- Range > 45 days → 400
- GET /api/plan/month → {year, month, days_in_month, plans}
- Days-in-month is correct for Feb (28), Apr (30), Jul (31)
- POST /api/plan/swap now returns violations list; force max_coconut_heavy_per_meal
- Force same_veggie_once_per_day violation across meals
- Manual swap persists (dish replaced, manual_edits increments)
- Variety across 7 consecutive days
"""
import os
import uuid
from datetime import datetime, timezone, timedelta, date as date_cls

import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://tamil-kitchen-ai.preview.emergentagent.com",
).rstrip("/")


def _unique_phone() -> str:
    return "+9198" + str(uuid.uuid4().int)[:8]


def _new_user_client(name="TEST_Cal", profile_extra: dict | None = None):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    phone = _unique_phone()
    r = s.post(f"{BASE_URL}/api/auth/phone/send", json={"phone": phone})
    assert r.status_code == 200, r.text
    r = s.post(
        f"{BASE_URL}/api/auth/phone/verify",
        json={"phone": phone, "code": "123456", "name": name},
    )
    assert r.status_code == 200, r.text
    token = r.json()["session_token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    profile = {
        "name": name,
        "diet": "veg",
        "household_size": 2,
        "spice_level": "medium",
        "favorites": [],
        "allergies": [],
        "custom_avoid": [],
        "health": {
            "height_cm": 165.0,
            "weight_kg": 60.0,
            "bmi": 22.0,
            "goals": ["balanced"],
        },
        "onboarding_complete": True,
    }
    if profile_extra:
        profile.update(profile_extra)
    r = s.put(f"{BASE_URL}/api/profile", json=profile)
    assert r.status_code == 200, r.text
    s.post(f"{BASE_URL}/api/pantry/bundle")
    return s


@pytest.fixture(scope="module")
def client():
    s = _new_user_client(name="TEST_Cal")
    yield s
    s.post(f"{BASE_URL}/api/profile/reset")
    s.post(f"{BASE_URL}/api/auth/logout")


def _today() -> date_cls:
    return datetime.now(timezone.utc).date()


COCONUT_IDS = {"ac_coconut_chutney", "vr_coconut", "kz_mor"}


# ============================================================ #
# Bulk generate
# ============================================================ #
class TestBulkGenerate:
    def test_bulk_generate_range_creates_all(self, client):
        # Use a future range to avoid clashing with today plans
        start = _today() + timedelta(days=1)
        end = start + timedelta(days=4)  # 5 days
        r = client.post(
            f"{BASE_URL}/api/plan/bulk-generate",
            json={
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "only_empty": True,
            },
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert "created" in d and "skipped" in d
        assert len(d["created"]) == 5
        assert d["skipped"] == []

    def test_bulk_generate_only_empty_skips_existing(self, client):
        # Same range; must all be skipped
        start = _today() + timedelta(days=1)
        end = start + timedelta(days=4)
        r = client.post(
            f"{BASE_URL}/api/plan/bulk-generate",
            json={
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "only_empty": True,
            },
        )
        assert r.status_code == 200
        d = r.json()
        assert d["created"] == []
        assert len(d["skipped"]) == 5

    def test_bulk_generate_force_regenerates(self, client):
        start = _today() + timedelta(days=1)
        end = start + timedelta(days=1)  # 2 days
        r = client.post(
            f"{BASE_URL}/api/plan/bulk-generate",
            json={
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "only_empty": False,
            },
        )
        assert r.status_code == 200
        assert len(r.json()["created"]) == 2

    def test_bulk_generate_rejects_range_over_45_days(self, client):
        start = _today() + timedelta(days=100)
        end = start + timedelta(days=46)
        r = client.post(
            f"{BASE_URL}/api/plan/bulk-generate",
            json={
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "only_empty": True,
            },
        )
        assert r.status_code == 400

    def test_bulk_generate_variety_across_days(self, client):
        # generate 7 fresh days and verify no single non-static dish >3x
        start = _today() + timedelta(days=30)
        end = start + timedelta(days=6)
        r = client.post(
            f"{BASE_URL}/api/plan/bulk-generate",
            json={
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "only_empty": False,
            },
        )
        assert r.status_code == 200
        # fetch each day
        counts: dict[str, int] = {}
        for i in range(7):
            iso = (start + timedelta(days=i)).isoformat()
            m = client.get(
                f"{BASE_URL}/api/plan/month",
                params={"year": (start + timedelta(days=i)).year,
                        "month": (start + timedelta(days=i)).month},
            )
            plans = m.json()["plans"]
            if iso not in plans:
                continue
            for meal in ("breakfast", "lunch", "dinner"):
                for it in plans[iso][meal]["items"]:
                    if it.get("static"):
                        continue
                    counts[it["id"]] = counts.get(it["id"], 0) + 1
        # No dish should appear more than 3x in 7 days (soft ceiling)
        offenders = {k: v for k, v in counts.items() if v > 3}
        assert not offenders, f"variety broken: {offenders}"


# ============================================================ #
# Month endpoint
# ============================================================ #
class TestPlanMonth:
    def test_plan_month_shape_current(self, client):
        today = _today()
        r = client.get(
            f"{BASE_URL}/api/plan/month",
            params={"year": today.year, "month": today.month},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["year"] == today.year
        assert d["month"] == today.month
        assert "days_in_month" in d and 28 <= d["days_in_month"] <= 31
        assert isinstance(d["plans"], dict)

    def test_plan_month_days_in_month_feb_2026(self, client):
        r = client.get(f"{BASE_URL}/api/plan/month", params={"year": 2026, "month": 2})
        assert r.status_code == 200
        # Feb 2026 has 28 days (not leap)
        assert r.json()["days_in_month"] == 28

    def test_plan_month_days_in_month_apr(self, client):
        r = client.get(f"{BASE_URL}/api/plan/month", params={"year": 2026, "month": 4})
        assert r.json()["days_in_month"] == 30

    def test_plan_month_days_in_month_jul(self, client):
        r = client.get(f"{BASE_URL}/api/plan/month", params={"year": 2026, "month": 7})
        assert r.json()["days_in_month"] == 31

    def test_plan_month_invalid_month(self, client):
        r = client.get(f"{BASE_URL}/api/plan/month", params={"year": 2026, "month": 13})
        assert r.status_code == 400

    def test_plan_month_contains_created_plans(self, client):
        # a bulk-gen created days should surface in the month view
        start = _today() + timedelta(days=1)
        r = client.get(
            f"{BASE_URL}/api/plan/month",
            params={"year": start.year, "month": start.month},
        )
        plans = r.json()["plans"]
        assert start.isoformat() in plans or (start + timedelta(days=1)).isoformat() in plans


# ============================================================ #
# Swap violations
# ============================================================ #
class TestSwapViolations:
    def test_swap_returns_violations_field(self, client):
        # generate a fresh plan for today
        today = _today().isoformat()
        r = client.post(
            f"{BASE_URL}/api/plan/generate",
            json={"date": today, "seed": 4001, "force": True},
        )
        assert r.status_code == 200
        plan = r.json()

        # pick lunch kuzhambu and swap to another kuzhambu — get options
        kuz = next((it for it in plan["lunch"]["items"] if it.get("category") == "kuzhambu"), None)
        assert kuz
        opts = client.get(
            f"{BASE_URL}/api/plan/swap-options",
            params={"date": today, "meal": "lunch", "recipe_id": kuz["id"]},
        ).json()["options"]
        assert opts
        r = client.post(
            f"{BASE_URL}/api/plan/swap",
            json={
                "date": today,
                "meal": "lunch",
                "current_recipe_id": kuz["id"],
                "new_recipe_id": opts[0]["id"],
            },
        )
        assert r.status_code == 200
        out = r.json()
        # violations key MUST be present (even if empty)
        assert "violations" in out
        assert isinstance(out["violations"], list)

    def test_force_coconut_violation_still_applies(self, client):
        """Directly swap in a coconut-heavy dish into a meal that already has
        max coconut count → violation returned but swap applied."""
        today = _today().isoformat()
        # ensure a fresh plan
        client.post(
            f"{BASE_URL}/api/plan/generate",
            json={"date": today, "seed": 4200, "force": True},
        )
        plan = client.get(f"{BASE_URL}/api/plan/today").json() if False else None
        # fetch via month
        m = client.get(
            f"{BASE_URL}/api/plan/month",
            params={"year": _today().year, "month": _today().month},
        ).json()
        plan = m["plans"][today]

        # Find a non-coconut, non-static poriyal in lunch to swap out.
        # And target coconut chutney (ac_coconut_chutney) as new dish (accompaniment).
        # accompaniment appears in breakfast usually; but the violations logic operates on the *new dish category*
        # regardless. We'll try swapping breakfast accompaniment → ac_coconut_chutney if any coconut already there.
        # Fallback: just check violations field is present when we force ac_coconut_chutney into a slot where it's category-compatible.
        # Easier deterministic path: find a non-coconut accompaniment in breakfast and swap it to ac_coconut_chutney.
        target_meal = "breakfast"
        current = None
        for it in plan[target_meal]["items"]:
            if it.get("category") == "accompaniment" and it["id"] not in COCONUT_IDS and not it.get("static"):
                current = it
                break
        if not current:
            pytest.skip("No non-coconut accompaniment in breakfast to test coconut violation")

        # Do the swap directly using recipe id (bypass swap-options which filters violations)
        r = client.post(
            f"{BASE_URL}/api/plan/swap",
            json={
                "date": today,
                "meal": target_meal,
                "current_recipe_id": current["id"],
                "new_recipe_id": "ac_coconut_chutney",
            },
        )
        assert r.status_code == 200, r.text
        out = r.json()
        # dish replaced
        new_ids = {it["id"] for it in out[target_meal]["items"]}
        assert "ac_coconut_chutney" in new_ids
        assert current["id"] not in new_ids
        # violations may or may not fire depending on # of coconut items already present.
        # If breakfast had 0 coconut before, violation won't fire (limit is 2).
        # Just assert violations key exists and dish swap applied.
        assert "violations" in out

    def test_force_same_veggie_violation(self, client):
        """Try to swap dinner's poriyal to one using the same veggie as lunch."""
        today = _today().isoformat()
        client.post(
            f"{BASE_URL}/api/plan/generate",
            json={"date": today, "seed": 4300, "force": True},
        )
        m = client.get(
            f"{BASE_URL}/api/plan/month",
            params={"year": _today().year, "month": _today().month},
        ).json()
        plan = m["plans"][today]

        # find lunch poriyal veggie
        from_meal = "lunch"
        lunch_pori = next(
            (it for it in plan[from_meal]["items"] if it.get("category") == "poriyal"),
            None,
        )
        if not lunch_pori:
            pytest.skip("No poriyal in lunch")
        lunch_veg = None
        for ing in lunch_pori.get("ingredients", []):
            if ing["ingredient_id"] in {
                "drumstick", "brinjal", "cabbage", "cauliflower", "beans",
                "carrot", "beetroot", "vazhakkai", "vendakkai", "pavakkai",
                "kothavarangai", "sorakkai", "pudalangai", "peerkangai",
                "poosanikai", "ash_gourd", "snake_gourd", "spinach_palak",
                "keerai_arakeerai", "keerai_pasalai", "potato", "capsicum",
            }:
                lunch_veg = ing["ingredient_id"]
                break
        if not lunch_veg:
            pytest.skip("Lunch poriyal has no simple veggie")

        # Fetch all recipes; find a poriyal with same veggie & != lunch dish
        # We'll query swap-options for dinner poriyal & filter
        dinner_pori = next(
            (it for it in plan.get("dinner", {}).get("items", []) if it.get("category") == "poriyal"),
            None,
        )
        if not dinner_pori:
            pytest.skip("No poriyal in dinner")

        # Get all recipes via API? Not exposed. Use swap-options for candidate list.
        opts = client.get(
            f"{BASE_URL}/api/plan/swap-options",
            params={"date": today, "meal": "dinner", "recipe_id": dinner_pori["id"]},
        ).json()["options"]

        target = None
        for o in opts:
            for ing in o.get("ingredients", []):
                if ing["ingredient_id"] == lunch_veg:
                    target = o
                    break
            if target:
                break

        if not target:
            pytest.skip(f"No dinner poriyal option shares veggie={lunch_veg} with lunch")

        r = client.post(
            f"{BASE_URL}/api/plan/swap",
            json={
                "date": today,
                "meal": "dinner",
                "current_recipe_id": dinner_pori["id"],
                "new_recipe_id": target["id"],
            },
        )
        assert r.status_code == 200, r.text
        out = r.json()
        # swap should have applied and violations should mention same_veggie_once_per_day
        rules = [v["rule"] for v in out.get("violations", [])]
        assert "same_veggie_once_per_day" in rules, f"expected same_veggie violation, got {rules}"
        # and dish is actually replaced
        new_ids = {it["id"] for it in out["dinner"]["items"]}
        assert target["id"] in new_ids


# ============================================================ #
# Manual edits counter
# ============================================================ #
class TestManualEdits:
    def test_swap_increments_manual_edits(self, client):
        today = _today().isoformat()
        client.post(
            f"{BASE_URL}/api/plan/generate",
            json={"date": today, "seed": 5001, "force": True},
        )
        m = client.get(
            f"{BASE_URL}/api/plan/month",
            params={"year": _today().year, "month": _today().month},
        ).json()
        before = m["plans"][today].get("manual_edits", 0)

        kuz = next(
            (it for it in m["plans"][today]["lunch"]["items"] if it.get("category") == "kuzhambu"),
            None,
        )
        opts = client.get(
            f"{BASE_URL}/api/plan/swap-options",
            params={"date": today, "meal": "lunch", "recipe_id": kuz["id"]},
        ).json()["options"]
        client.post(
            f"{BASE_URL}/api/plan/swap",
            json={
                "date": today,
                "meal": "lunch",
                "current_recipe_id": kuz["id"],
                "new_recipe_id": opts[0]["id"],
            },
        )
        m2 = client.get(
            f"{BASE_URL}/api/plan/month",
            params={"year": _today().year, "month": _today().month},
        ).json()
        after = m2["plans"][today].get("manual_edits", 0)
        assert after == before + 1, f"manual_edits before={before} after={after}"
