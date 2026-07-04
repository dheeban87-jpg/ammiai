"""AmmiAI Slice 2 backend tests: phone-OTP auth + profile + pantry CRUD + waste log."""
import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://tamil-kitchen-ai.preview.emergentagent.com",
).rstrip("/")


def _unique_phone() -> str:
    # 10-digit body, keeps +91 prefix. Unique per run to avoid session collisions.
    return "+9199" + str(uuid.uuid4().int)[:8]


@pytest.fixture(scope="module")
def phone():
    return _unique_phone()


@pytest.fixture(scope="module")
def session(phone):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})

    r = s.post(f"{BASE_URL}/api/auth/phone/send", json={"phone": phone})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("sent") is True and d.get("mock") is True and "hint" in d

    r = s.post(
        f"{BASE_URL}/api/auth/phone/verify",
        json={"phone": phone, "code": "123456", "name": "TEST_Ammu"},
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert "session_token" in d and "user" in d
    token = d["session_token"]
    user = d["user"]
    assert user["phone"] == phone
    assert user["name"] == "TEST_Ammu"
    assert "_id" not in user

    s.headers.update({"Authorization": f"Bearer {token}"})
    return {"client": s, "token": token, "user": user, "phone": phone}


# ---------- Auth ---------- #
class TestPhoneAuth:
    def test_send_invalid_phone(self):
        r = requests.post(f"{BASE_URL}/api/auth/phone/send", json={"phone": "abc"})
        assert r.status_code == 400

    def test_verify_without_send(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/phone/verify",
            json={"phone": _unique_phone(), "code": "123456"},
        )
        assert r.status_code == 400

    def test_verify_bad_code_format(self, phone):
        # send first (session fixture already sent, but idempotent — re-send)
        requests.post(f"{BASE_URL}/api/auth/phone/send", json={"phone": phone})
        r = requests.post(
            f"{BASE_URL}/api/auth/phone/verify",
            json={"phone": phone, "code": "12"},
        )
        assert r.status_code == 400

    def test_me_no_token(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_me_with_token(self, session):
        r = session["client"].get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200
        d = r.json()
        assert "user" in d and "profile" in d
        assert d["user"]["user_id"] == session["user"]["user_id"]
        # Profile must be null (or contain onboarding_complete false) BEFORE onboarding.
        # Server returns None when profile doc missing.
        assert d["profile"] is None or d["profile"].get("onboarding_complete") in (False, None)


# ---------- Profile ---------- #
class TestProfile:
    def test_put_profile_full(self, session):
        payload = {
            "name": "TEST_Ammu",
            "diet": "veg",
            "household_size": 3,
            "spice_level": "medium",
            "favorites": ["kz_sambar", "pr_beans_poriyal"],
            "allergies": ["no_onion_garlic", "no_coconut"],
            "custom_avoid": ["cabbage"],
            "health": {
                "height_cm": 165.0,
                "weight_kg": 60.0,
                "bmi": 22.0,
                "goals": ["balanced", "reduce_waste"],
            },
            "onboarding_complete": True,
        }
        r = session["client"].put(f"{BASE_URL}/api/profile", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "_id" not in d
        assert d["diet"] == "veg"
        assert d["household_size"] == 3
        assert d["spice_level"] == "medium"
        assert d["favorites"] == ["kz_sambar", "pr_beans_poriyal"]
        assert d["allergies"] == ["no_onion_garlic", "no_coconut"]
        assert d["custom_avoid"] == ["cabbage"]
        assert d["health"]["bmi"] == 22.0
        assert d["health"]["goals"] == ["balanced", "reduce_waste"]
        assert d["onboarding_complete"] is True

    def test_get_profile_after_put(self, session):
        r = session["client"].get(f"{BASE_URL}/api/profile")
        assert r.status_code == 200
        d = r.json()
        assert d["diet"] == "veg"
        assert d["onboarding_complete"] is True
        assert d["household_size"] == 3
        assert d["health"]["height_cm"] == 165.0

    def test_me_profile_populated(self, session):
        r = session["client"].get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200
        assert r.json()["profile"]["onboarding_complete"] is True


# ---------- Pantry bundle + CRUD + freshness ---------- #
class TestPantryBundle:
    def test_bundle_add_8(self, session):
        r = session["client"].post(f"{BASE_URL}/api/pantry/bundle")
        assert r.status_code == 200
        d = r.json()
        assert d["added"] == 8
        ids = {i["ingredient_id"] for i in d["items"]}
        assert ids == {"rice", "toor_dal", "urad_dal", "tamarind", "onion", "tomato", "cooking_oil", "curd"}
        for it in d["items"]:
            assert it["freshness"] in {"green", "yellow", "red", "unknown"}
            assert "ingredient_name" in it
            assert "days_left" in it

    def test_bundle_idempotent(self, session):
        r = session["client"].post(f"{BASE_URL}/api/pantry/bundle")
        assert r.status_code == 200
        assert r.json()["added"] == 0

    def test_pantry_list(self, session):
        r = session["client"].get(f"{BASE_URL}/api/pantry")
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 8
        for it in items:
            assert "_id" not in it


class TestPantryAddAndEnrich:
    def test_add_tomato_enriched(self, session):
        today = datetime.now(timezone.utc).date().isoformat()
        # tomato was added by bundle; delete it first for clean assertion
        r_list = session["client"].get(f"{BASE_URL}/api/pantry").json()
        for it in r_list:
            if it["ingredient_id"] == "tomato":
                session["client"].delete(f"{BASE_URL}/api/pantry/{it['id']}")

        r = session["client"].post(
            f"{BASE_URL}/api/pantry",
            json={
                "ingredient_id": "tomato",
                "qty": 0.5,
                "unit": "kg",
                "storage": "fridge",
                "purchase_date": today,
            },
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ingredient_name"].lower() == "tomato"
        assert d["shelf_days"] == 8  # fridge shelf for tomato per shelf_life.json
        assert d["days_left"] == 8
        assert d["freshness"] == "green"

    def test_freshness_yellow(self, session):
        # 6 days ago → 2 days left → yellow (alert_before_days=2 for tomato)
        pd = (datetime.now(timezone.utc).date() - timedelta(days=6)).isoformat()
        r = session["client"].post(
            f"{BASE_URL}/api/pantry",
            json={
                "ingredient_id": "tomato",
                "qty": 0.25,
                "unit": "kg",
                "storage": "fridge",
                "purchase_date": pd,
            },
        )
        assert r.status_code == 200
        d = r.json()
        assert d["days_left"] == 2
        assert d["freshness"] == "yellow"
        session["client"].delete(f"{BASE_URL}/api/pantry/{d['id']}")

    def test_freshness_red(self, session):
        # 7 days ago → 1 day left → red
        pd = (datetime.now(timezone.utc).date() - timedelta(days=7)).isoformat()
        r = session["client"].post(
            f"{BASE_URL}/api/pantry",
            json={
                "ingredient_id": "tomato",
                "qty": 0.1,
                "unit": "kg",
                "storage": "fridge",
                "purchase_date": pd,
            },
        )
        assert r.status_code == 200
        d = r.json()
        assert d["days_left"] == 1
        assert d["freshness"] == "red"
        session["client"].delete(f"{BASE_URL}/api/pantry/{d['id']}")

    def test_add_unknown_ingredient_404(self, session):
        r = session["client"].post(
            f"{BASE_URL}/api/pantry",
            json={
                "ingredient_id": "does_not_exist",
                "qty": 1,
                "unit": "kg",
                "storage": "pantry",
            },
        )
        assert r.status_code == 404


class TestPantryPatchDelete:
    @pytest.fixture(scope="class")
    def onion_id(self, session):
        r = session["client"].get(f"{BASE_URL}/api/pantry").json()
        for it in r:
            if it["ingredient_id"] == "onion":
                return it["id"]
        pytest.skip("onion not in pantry")

    def test_patch_qty(self, session, onion_id):
        r = session["client"].patch(
            f"{BASE_URL}/api/pantry/{onion_id}", json={"qty": 2}
        )
        assert r.status_code == 200
        assert r.json()["qty"] == 2
        # Verify GET reflects change
        items = session["client"].get(f"{BASE_URL}/api/pantry").json()
        onion = next(i for i in items if i["id"] == onion_id)
        assert onion["qty"] == 2

    def test_delete_item(self, session, onion_id):
        r = session["client"].delete(f"{BASE_URL}/api/pantry/{onion_id}")
        assert r.status_code == 200
        # Verify gone
        items = session["client"].get(f"{BASE_URL}/api/pantry").json()
        assert all(i["id"] != onion_id for i in items)

    def test_delete_missing_404(self, session):
        r = session["client"].delete(f"{BASE_URL}/api/pantry/nope_xyz")
        assert r.status_code == 404


# ---------- Discard + waste log ---------- #
class TestDiscardAndWasteLog:
    def test_discard_tomato_creates_log(self, session):
        # Find tomato (0.5kg from earlier test)
        items = session["client"].get(f"{BASE_URL}/api/pantry").json()
        tomato = next((i for i in items if i["ingredient_id"] == "tomato" and i["qty"] == 0.5), None)
        assert tomato is not None, "expected tomato 0.5kg in pantry"

        r = session["client"].post(
            f"{BASE_URL}/api/pantry/{tomato['id']}/discard",
            json={"reason": "expired"},
        )
        assert r.status_code == 200
        d = r.json()
        assert d["ingredient_id"] == "tomato"
        # 0.5 kg * ₹30/kg = ₹15
        assert d["estimated_inr"] == 15.0
        assert d["reason"] == "expired"

        # Pantry no longer has that id
        items_after = session["client"].get(f"{BASE_URL}/api/pantry").json()
        assert all(i["id"] != tomato["id"] for i in items_after)

    def test_waste_log_total(self, session):
        r = session["client"].get(f"{BASE_URL}/api/waste-log")
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "total_estimated_inr" in d
        assert d["total_estimated_inr"] >= 15.0
        assert any(i["ingredient_id"] == "tomato" for i in d["items"])


# ---------- Reset + logout ---------- #
class TestResetAndLogout:
    def test_profile_reset(self, session):
        r = session["client"].post(f"{BASE_URL}/api/profile/reset")
        assert r.status_code == 200
        assert r.json()["ok"] is True

        prof = session["client"].get(f"{BASE_URL}/api/profile").json()
        assert prof.get("onboarding_complete") in (False, None)

        pantry = session["client"].get(f"{BASE_URL}/api/pantry").json()
        assert pantry == []

    def test_logout_invalidates_token(self, session):
        r = session["client"].post(f"{BASE_URL}/api/auth/logout")
        assert r.status_code == 200
        r = session["client"].get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401
