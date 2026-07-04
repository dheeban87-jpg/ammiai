"""AmmiAI Slice 1 backend tests: data seeding + read endpoints."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://tamil-kitchen-ai.preview.emergentagent.com").rstrip("/")

EXPECTED_CATEGORIES = {"kuzhambu", "poriyal", "kootu", "rasam", "tiffin", "variety_rice", "nonveg", "accompaniment"}


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- root & stats ---------- #
class TestRootAndStats:
    def test_root(self, api):
        r = api.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        assert r.json() == {"app": "AmmiAI", "status": "ok"}

    def test_stats(self, api):
        r = api.get(f"{BASE_URL}/api/stats")
        assert r.status_code == 200
        d = r.json()
        assert d["ingredients"] == 69
        assert d["recipes"] == 67
        assert d["meal_rule_docs"] == 1
        cats = d["recipe_categories"]
        assert isinstance(cats, dict)
        assert set(cats.keys()) == EXPECTED_CATEGORIES
        assert len(cats) == 8


# ---------- ingredients ---------- #
class TestIngredients:
    def test_list(self, api):
        r = api.get(f"{BASE_URL}/api/ingredients")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) == 69
        for it in items:
            assert "_id" not in it
        sample = items[0]
        for key in ("ingredient_id", "name", "pantry_days", "fridge_days", "alert_before_days"):
            assert key in sample, f"missing {key} in ingredient sample"

    def test_get_known(self, api):
        r = api.get(f"{BASE_URL}/api/ingredients/spinach_palak")
        assert r.status_code == 200
        d = r.json()
        assert d.get("ingredient_id") == "spinach_palak"
        assert "_id" not in d

    def test_get_unknown_404(self, api):
        r = api.get(f"{BASE_URL}/api/ingredients/does_not_exist_xyz")
        assert r.status_code == 404


# ---------- recipes ---------- #
class TestRecipes:
    def test_list(self, api):
        r = api.get(f"{BASE_URL}/api/recipes")
        assert r.status_code == 200
        items = r.json()
        assert len(items) == 67
        for it in items:
            assert "_id" not in it
        sample = items[0]
        for key in ("id", "name_en", "name_ta", "category", "ingredients"):
            assert key in sample, f"missing {key} in recipe sample"
        assert isinstance(sample["ingredients"], list)

    def test_filter_by_kuzhambu(self, api):
        r = api.get(f"{BASE_URL}/api/recipes", params={"category": "kuzhambu"})
        assert r.status_code == 200
        items = r.json()
        assert len(items) == 10
        assert all(x["category"] == "kuzhambu" for x in items)

    def test_get_known(self, api):
        r = api.get(f"{BASE_URL}/api/recipes/kz_sambar")
        assert r.status_code == 200
        d = r.json()
        assert d.get("id") == "kz_sambar"
        assert "_id" not in d

    def test_get_unknown_404(self, api):
        r = api.get(f"{BASE_URL}/api/recipes/no_such_recipe_zzz")
        assert r.status_code == 404


# ---------- meal rules ---------- #
class TestMealRules:
    def test_meal_rules(self, api):
        r = api.get(f"{BASE_URL}/api/meal-rules")
        assert r.status_code == 200
        d = r.json()
        assert "_id" not in d
        for key in ("meal_templates", "pairing_rules", "avoid_rules", "daily_nutrition_targets_icmr"):
            assert key in d, f"missing key {key} in meal-rules doc"
