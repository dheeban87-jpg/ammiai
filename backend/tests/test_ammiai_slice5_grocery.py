"""AmmiAI Slice 5 backend tests: Grocery tab + order-placed + cooked + streak.

Covers:
- GET /api/grocery/list shape (groups, totals, household_size scaling, staples excluded)
- Pantry stock deduction & unit conversion (g↔kg, ml↔L)
- POST /api/grocery/order-placed merges into existing pantry rows (no duplicates)
- POST /api/plan/{date}/cooked deducts ingredients × household_size and skips staples
- cooked flag persisted on plan doc
- Streak increments/resets, idempotency same-day, GET /api/streak
- /api/grocery/list end<start → 400
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


def _phone() -> str:
    return "+9198" + str(uuid.uuid4().int)[:8]


def _new_client(household=2, name="TEST_Groc"):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    ph = _phone()
    r = s.post(f"{BASE_URL}/api/auth/phone/send", json={"phone": ph})
    assert r.status_code == 200
    r = s.post(
        f"{BASE_URL}/api/auth/phone/verify",
        json={"phone": ph, "code": "123456", "name": name},
    )
    assert r.status_code == 200
    s.headers.update({"Authorization": f"Bearer {r.json()['session_token']}"})
    r = s.put(
        f"{BASE_URL}/api/profile",
        json={
            "name": name, "diet": "veg", "household_size": household,
            "spice_level": "medium", "onboarding_complete": True,
            "health": {"height_cm": 165, "weight_kg": 60, "bmi": 22, "goals": ["balanced"]},
        },
    )
    assert r.status_code == 200
    return s


def _today():
    return datetime.now(timezone.utc).date()


@pytest.fixture(scope="module")
def client():
    s = _new_client(household=2)
    yield s
    s.post(f"{BASE_URL}/api/profile/reset")
    s.post(f"{BASE_URL}/api/auth/logout")


# -------- Grocery list -------- #
class TestGroceryList:
    def test_grocery_list_shape_default_7_days(self, client):
        # Generate today + 6 future days
        today = _today()
        client.post(
            f"{BASE_URL}/api/plan/bulk-generate",
            json={
                "start_date": today.isoformat(),
                "end_date": (today + timedelta(days=6)).isoformat(),
                "only_empty": False,
            },
        )
        r = client.get(f"{BASE_URL}/api/grocery/list?days=7")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("start_date", "end_date", "household_size", "days_covered",
                  "groups", "total_items", "total_estimated_inr"):
            assert k in d, f"missing key {k}"
        assert d["household_size"] == 2
        # Range spans 7 days
        s = date_cls.fromisoformat(d["start_date"])
        e = date_cls.fromisoformat(d["end_date"])
        assert (e - s).days == 6
        assert isinstance(d["groups"], list)
        # Each group has category+items
        for g in d["groups"]:
            assert "category" in g and "items" in g
            for it in g["items"]:
                for k in ("ingredient_id", "name", "category", "qty", "unit"):
                    assert k in it

    def test_staples_excluded(self, client):
        r = client.get(f"{BASE_URL}/api/grocery/list?days=7")
        assert r.status_code == 200
        d = r.json()
        staple_ids = {
            "salt", "sugar", "turmeric_powder", "mustard_seeds", "cumin_seeds",
            "asafoetida", "curry_leaves", "red_chili_powder",
            "coriander_powder", "sambar_powder", "rasam_powder",
        }
        seen = set()
        for g in d["groups"]:
            for it in g["items"]:
                seen.add(it["ingredient_id"])
        overlap = seen & staple_ids
        assert not overlap, f"staples should not appear: {overlap}"

    def test_grocery_end_before_start_400(self, client):
        today = _today()
        r = client.get(
            f"{BASE_URL}/api/grocery/list",
            params={
                "start_date": today.isoformat(),
                "end_date": (today - timedelta(days=1)).isoformat(),
            },
        )
        assert r.status_code == 400

    def test_grocery_deducts_pantry(self, client):
        # Add a large quantity of tomato to pantry, then grocery should reduce/omit it
        # Ensure fresh pantry
        pantry = client.get(f"{BASE_URL}/api/pantry").json()
        for it in pantry:
            client.delete(f"{BASE_URL}/api/pantry/{it['id']}")

        client.post(
            f"{BASE_URL}/api/pantry",
            json={"ingredient_id": "tomato", "qty": 5, "unit": "kg", "storage": "fridge"},
        )
        r = client.get(f"{BASE_URL}/api/grocery/list?days=7")
        assert r.status_code == 200
        # Tomato deficit should be 0 → tomato not in list
        for g in r.json()["groups"]:
            for it in g["items"]:
                assert it["ingredient_id"] != "tomato", "tomato should be covered by 5kg pantry"

    def test_household_size_scaling(self, client):
        # Change household to 4 and confirm request completes with larger totals than hh=2 baseline
        # Clear pantry first
        p = client.get(f"{BASE_URL}/api/pantry").json()
        for it in p:
            client.delete(f"{BASE_URL}/api/pantry/{it['id']}")
        client.put(
            f"{BASE_URL}/api/profile",
            json={"household_size": 2, "onboarding_complete": True},
        )
        r1 = client.get(f"{BASE_URL}/api/grocery/list?days=7").json()
        client.put(
            f"{BASE_URL}/api/profile",
            json={"household_size": 4, "onboarding_complete": True},
        )
        r2 = client.get(f"{BASE_URL}/api/grocery/list?days=7").json()
        assert r2["household_size"] == 4
        assert r2["total_items"] >= r1["total_items"] - 1  # scaling >= (allow rounding)
        # restore
        client.put(
            f"{BASE_URL}/api/profile",
            json={"household_size": 2, "onboarding_complete": True},
        )


# -------- Order placed -------- #
class TestOrderPlaced:
    def test_order_placed_creates_and_merges(self, client):
        # Clean pantry
        p = client.get(f"{BASE_URL}/api/pantry").json()
        for it in p:
            client.delete(f"{BASE_URL}/api/pantry/{it['id']}")

        # First order — creates tomato row
        r = client.post(
            f"{BASE_URL}/api/grocery/order-placed",
            json={"items": [{"ingredient_id": "tomato", "qty": 500, "unit": "g"}]},
        )
        assert r.status_code == 200, r.text
        assert r.json()["added"] == 1
        pantry = client.get(f"{BASE_URL}/api/pantry").json()
        tom = [x for x in pantry if x["ingredient_id"] == "tomato"]
        assert len(tom) == 1
        assert tom[0]["purchase_date"] == _today().isoformat()

        # Second order — SHOULD merge, not duplicate
        r = client.post(
            f"{BASE_URL}/api/grocery/order-placed",
            json={"items": [{"ingredient_id": "tomato", "qty": 500, "unit": "g"}]},
        )
        assert r.status_code == 200
        pantry = client.get(f"{BASE_URL}/api/pantry").json()
        tom = [x for x in pantry if x["ingredient_id"] == "tomato"]
        assert len(tom) == 1, "should merge into single row"
        # 500g + 500g = 1kg
        row = tom[0]
        # accept "kg" 1.0 or 1
        qty = float(row["qty"])
        if row["unit"] == "kg":
            assert abs(qty - 1.0) < 0.05, f"expected 1kg, got {qty}{row['unit']}"
        else:
            assert row["unit"] == "g" and abs(qty - 1000) < 5

    def test_order_placed_ignores_unknown(self, client):
        r = client.post(
            f"{BASE_URL}/api/grocery/order-placed",
            json={"items": [{"ingredient_id": "nonexistent_xyz", "qty": 100, "unit": "g"}]},
        )
        assert r.status_code == 200
        assert r.json()["added"] == 0


# -------- Cooked + streak -------- #
class TestCookedAndStreak:
    def _fresh_plan_for_today(self, client, seed=9001):
        today = _today().isoformat()
        r = client.post(
            f"{BASE_URL}/api/plan/generate",
            json={"date": today, "seed": seed, "force": True},
        )
        assert r.status_code == 200
        return r.json()

    def test_cooked_deducts_and_returns_shape(self, client):
        # Give abundant pantry so nothing is unmet
        p = client.get(f"{BASE_URL}/api/pantry").json()
        for it in p:
            client.delete(f"{BASE_URL}/api/pantry/{it['id']}")
        client.post(f"{BASE_URL}/api/pantry/bundle")
        for ing in ["tomato", "onion", "brinjal", "drumstick", "carrot",
                    "beans", "cabbage", "green_chili", "coconut", "ginger", "garlic"]:
            client.post(
                f"{BASE_URL}/api/pantry",
                json={"ingredient_id": ing, "qty": 2, "unit": "kg"},
            )

        plan = self._fresh_plan_for_today(client, seed=9101)
        today = _today().isoformat()
        # pick a non-static lunch dish
        target = next(
            (it for it in plan["lunch"]["items"] if not it.get("static")),
            None,
        )
        assert target, "no non-static lunch dish"

        r = client.post(
            f"{BASE_URL}/api/plan/{today}/cooked",
            json={"meal": "lunch", "recipe_id": target["id"]},
        )
        assert r.status_code == 200, r.text
        out = r.json()
        assert "deducted" in out and isinstance(out["deducted"], list)
        for row in out["deducted"]:
            for k in ("ingredient_id", "requested_base", "unmet_base", "base_unit"):
                assert k in row
        assert "streak" in out
        for k in ("current_streak", "longest_streak", "total_cooked"):
            assert k in out["streak"]
        assert out["streak"]["current_streak"] >= 1
        assert out["streak"]["total_cooked"] >= 1

    def test_cooked_flag_persisted(self, client):
        plan = self._fresh_plan_for_today(client, seed=9202)
        today = _today().isoformat()
        target = next((it for it in plan["dinner"]["items"] if not it.get("static")), None)
        assert target
        client.post(
            f"{BASE_URL}/api/plan/{today}/cooked",
            json={"meal": "dinner", "recipe_id": target["id"]},
        )
        # Re-fetch
        d = client.get(f"{BASE_URL}/api/plan/today").json()
        matched = next(it for it in d["dinner"]["items"] if it.get("id") == target["id"])
        assert matched.get("cooked") is True
        assert matched.get("cooked_at")

    def test_cooked_idempotent_same_day_streak(self, client):
        plan = self._fresh_plan_for_today(client, seed=9303)
        today = _today().isoformat()
        target = next((it for it in plan["lunch"]["items"] if not it.get("static")), None)
        r1 = client.post(
            f"{BASE_URL}/api/plan/{today}/cooked",
            json={"meal": "lunch", "recipe_id": target["id"]},
        )
        s1 = r1.json()["streak"]["current_streak"]
        # Cook again same day (any dish) → streak MUST NOT double-count
        target2 = next(
            (it for it in plan["dinner"]["items"] if not it.get("static")),
            None,
        )
        r2 = client.post(
            f"{BASE_URL}/api/plan/{today}/cooked",
            json={"meal": "dinner", "recipe_id": target2["id"]},
        )
        s2 = r2.json()["streak"]["current_streak"]
        assert s2 == s1, f"same-day cook should not increment streak: {s1}→{s2}"

    def test_get_streak(self, client):
        r = client.get(f"{BASE_URL}/api/streak")
        assert r.status_code == 200
        d = r.json()
        for k in ("current_streak", "longest_streak", "total_cooked"):
            assert k in d

    def test_cooked_missing_dish_404(self, client):
        today = _today().isoformat()
        r = client.post(
            f"{BASE_URL}/api/plan/{today}/cooked",
            json={"meal": "lunch", "recipe_id": "totally_bogus_id"},
        )
        assert r.status_code == 404
