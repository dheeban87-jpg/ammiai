"""
AmmiAI Slice 5 - Notif + Premium + Weekly Report + Delete Account + AI stub
E2E backend tests against the public ingress.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://tamil-kitchen-ai.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _phone():
    # Unique phone per test module run so state doesn't leak between iterations
    return "+9190000" + str(int(time.time()) % 100000).zfill(5)


@pytest.fixture(scope="module")
def phone():
    return _phone()


@pytest.fixture(scope="module")
def session(phone):
    """Sign in via mocked phone OTP and return an authenticated requests.Session."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})

    r = s.post(f"{API}/auth/phone/send", json={"phone": phone})
    assert r.status_code == 200, r.text
    assert r.json().get("sent") is True

    r = s.post(
        f"{API}/auth/phone/verify",
        json={"phone": phone, "code": "123456", "name": "Slice5 QA"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "session_token" in data and "user" in data
    token = data["session_token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    s.user = data["user"]  # type: ignore
    s.token = token  # type: ignore
    yield s
    # Best-effort cleanup (some tests intentionally delete account)
    try:
        s.post(f"{API}/auth/logout")
    except Exception:
        pass


# ------------------------------------------------------------------ #
# 1. Notification preferences
# ------------------------------------------------------------------ #
class TestNotificationPrefs:
    def test_get_defaults(self, session):
        r = session.get(f"{API}/settings/notifications")
        assert r.status_code == 200, r.text
        doc = r.json()
        # Defaults exist for known keys
        for key in (
            "pantry_alert_enabled",
            "meal_reminders_enabled",
            "breakfast_time",
            "lunch_time",
            "dinner_time",
            "cook_check_enabled",
            "weekly_report_enabled",
        ):
            assert key in doc, f"missing default field {key}: {doc}"

    def test_put_partial_patch_persists(self, session):
        patch = {"meal_reminders_enabled": False, "dinner_time": "20:15"}
        r = session.put(f"{API}/settings/notifications", json=patch)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["meal_reminders_enabled"] is False
        assert doc["dinner_time"] == "20:15"

        # GET reflects it
        r = session.get(f"{API}/settings/notifications")
        assert r.status_code == 200
        doc = r.json()
        assert doc["meal_reminders_enabled"] is False
        assert doc["dinner_time"] == "20:15"
        # Untouched field still present (from defaults)
        assert "breakfast_time" in doc


# ------------------------------------------------------------------ #
# 2. Premium status + MOCKED purchase + cancel
# ------------------------------------------------------------------ #
class TestPremiumFlow:
    def test_default_status_free(self, session):
        # Ensure user starts as non-premium
        session.post(f"{API}/premium/cancel")
        r = session.get(f"{API}/premium/status")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["is_premium"] is False
        assert "quota" in data and "free_limits" in data
        assert data["quota"]["pantry_max"] == 25
        assert data["quota"]["plan_generations_max"] == 4

    def test_purchase_yearly_flips_premium(self, session):
        r = session.post(
            f"{API}/premium/purchase", json={"plan": "yearly", "receipt": "MOCK"}
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["is_premium"] is True
        assert data["plan"] == "yearly"
        assert data.get("expires_at")

        r = session.get(f"{API}/premium/status")
        assert r.status_code == 200
        st = r.json()
        assert st["is_premium"] is True
        assert st["quota"]["pantry_max"] is None
        assert st["quota"]["plan_generations_max"] is None

    def test_cancel_flips_back(self, session):
        r = session.post(f"{API}/premium/cancel")
        assert r.status_code == 200
        r = session.get(f"{API}/premium/status")
        st = r.json()
        assert st["is_premium"] is False


# ------------------------------------------------------------------ #
# 3. Free-tier quota enforcement
# ------------------------------------------------------------------ #
class TestQuotas:
    def test_pantry_quota_402_on_26th(self, session):
        # Ensure not premium
        session.post(f"{API}/premium/cancel")

        # Clean pantry so we know exactly how many rows we add
        r = session.get(f"{API}/pantry")
        assert r.status_code == 200
        for item in r.json():
            session.delete(f"{API}/pantry/{item['id']}")

        # Pick an ingredient
        r = session.get(f"{API}/ingredients")
        assert r.status_code == 200
        ing_list = r.json()
        assert isinstance(ing_list, list) and len(ing_list) >= 1
        # Prefer a stable known ID if available
        onion = next((i for i in ing_list if i.get("ingredient_id") == "onion"), None)
        ing_id = onion["ingredient_id"] if onion else ing_list[0]["ingredient_id"]

        # Add 25 (must all succeed)
        for i in range(25):
            r = session.post(
                f"{API}/pantry",
                json={"ingredient_id": ing_id, "qty": 1, "unit": "kg", "storage": "pantry"},
            )
            assert r.status_code == 200, f"row {i}: {r.status_code} {r.text}"

        # 26th must 402
        r = session.post(
            f"{API}/pantry",
            json={"ingredient_id": ing_id, "qty": 1, "unit": "kg", "storage": "pantry"},
        )
        assert r.status_code == 402, r.text
        detail = r.json().get("detail", "")
        assert "Free plan limit" in detail

        # Purchase premium and retry — now succeeds
        r = session.post(f"{API}/premium/purchase", json={"plan": "yearly", "receipt": "MOCK"})
        assert r.status_code == 200
        r = session.post(
            f"{API}/pantry",
            json={"ingredient_id": ing_id, "qty": 1, "unit": "kg", "storage": "pantry"},
        )
        assert r.status_code == 200, r.text

    def test_plan_generate_quota(self, session):
        # Cancel premium so free limit applies
        session.post(f"{API}/premium/cancel")

        ids = []
        for i in range(4):
            r = session.post(f"{API}/plan/generate", json={"force": True})
            assert r.status_code == 200, f"gen {i}: {r.status_code} {r.text}"
            ids.append(r.json().get("id") or r.json().get("date"))

        # 5th must 402
        r = session.post(f"{API}/plan/generate", json={"force": True})
        assert r.status_code == 402, r.text
        assert "Free plan limit" in r.json().get("detail", "")

        # Upgrade → 5th succeeds
        session.post(f"{API}/premium/purchase", json={"plan": "yearly", "receipt": "MOCK"})
        r = session.post(f"{API}/plan/generate", json={"force": True})
        assert r.status_code == 200, r.text


# ------------------------------------------------------------------ #
# 4. Weekly report
# ------------------------------------------------------------------ #
class TestWeeklyReport:
    def test_default_shape(self, session):
        r = session.get(f"{API}/report/weekly")
        assert r.status_code == 200, r.text
        d = r.json()
        for key in (
            "start_date",
            "end_date",
            "money_saved_inr",
            "waste_count",
            "waste_inr",
            "consumed_inr",
            "cooked_count",
            "diet_balance_score",
            "current_streak",
            "longest_streak",
            "badges",
        ):
            assert key in d, f"missing {key} in {d}"
        assert isinstance(d["badges"], list)
        assert 0 <= d["diet_balance_score"] <= 100

    def test_accepts_end_date(self, session):
        r = session.get(f"{API}/report/weekly", params={"end_date": "2026-01-15"})
        assert r.status_code == 200
        d = r.json()
        assert d["end_date"] == "2026-01-15"
        assert d["start_date"] == "2026-01-09"


# ------------------------------------------------------------------ #
# 5. AI stub
# ------------------------------------------------------------------ #
class TestAIStub:
    def test_status_not_configured(self, session):
        r = session.get(f"{API}/ai/status")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["configured"] is False
        assert d["model"] == "claude-sonnet-4-5"
        assert isinstance(d["capabilities"], list) and len(d["capabilities"]) >= 1

    def test_request_501_when_not_configured(self, session):
        r = session.post(f"{API}/ai/request", json={"kind": "meal_narration"})
        assert r.status_code == 501, r.text
        assert "AI layer not configured" in r.json().get("detail", "")


# ------------------------------------------------------------------ #
# 6. Hard-delete account (RUN LAST - invalidates token)
# ------------------------------------------------------------------ #
class TestZDeleteAccount:
    """z-prefixed so it runs after other classes (pytest default alphabetical)."""

    def test_delete_and_token_invalidated(self):
        # Fresh phone/user so we don't clobber module-scope session
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        phone = "+9199999" + str(uuid.uuid4().int)[-5:]

        r = s.post(f"{API}/auth/phone/send", json={"phone": phone})
        assert r.status_code == 200
        r = s.post(
            f"{API}/auth/phone/verify",
            json={"phone": phone, "code": "123456", "name": "Delete QA"},
        )
        assert r.status_code == 200
        token = r.json()["session_token"]
        s.headers.update({"Authorization": f"Bearer {token}"})

        # /auth/me works BEFORE delete
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 200

        # Delete
        r = s.delete(f"{API}/account")
        assert r.status_code == 200, r.text
        assert r.json().get("deleted") is True

        # /auth/me MUST 401 now
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 401, f"expected 401 after delete, got {r.status_code}: {r.text}"

        r = s.get(f"{API}/pantry")
        assert r.status_code == 401, f"expected 401 after delete, got {r.status_code}: {r.text}"
