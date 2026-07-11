from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import uuid
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field
import httpx

from meal_engine import (
    PantrySnapshot,
    PlannerContext,
    STAPLE_ALWAYS,
    cook_now as engine_cook_now,
    daily_targets,
    plan_day as engine_plan_day,
    rescue_dishes as engine_rescue,
    swap_options as engine_swap_options,
)


ROOT_DIR = Path(__file__).parent
DATA_DIR = ROOT_DIR / "data"
load_dotenv(ROOT_DIR / ".env")

# MongoDB connection
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="AmmiAI API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("ammiai")


# ------------------------- Seeding ------------------------- #
_PRICING: Dict[str, Dict[str, Any]] = {}


async def _seed_ingredients() -> int:
    with open(DATA_DIR / "shelf_life.json", "r", encoding="utf-8") as f:
        items = json.load(f)
    await db.ingredients.delete_many({})
    if items:
        await db.ingredients.insert_many(items)
    return len(items)


async def _seed_recipes() -> int:
    with open(DATA_DIR / "recipes_ammiaai_v2.json", "r", encoding="utf-8") as f:
        items = json.load(f)
    # Preserve user-created custom dishes across restarts/reseeds
    await db.recipes.delete_many({"custom": {"$ne": True}})
    if items:
        await db.recipes.insert_many(items)
    return len(items)


async def _seed_meal_rules() -> int:
    with open(DATA_DIR / "meal_combination_rules.json", "r", encoding="utf-8") as f:
        doc = json.load(f)
    await db.meal_rules.delete_many({})
    await db.meal_rules.insert_one({"key": "default", **doc})
    templates = doc.get("meal_templates", {})
    return len(templates) if isinstance(templates, dict) else 0


def _load_pricing() -> None:
    global _PRICING
    with open(DATA_DIR / "pricing.json", "r", encoding="utf-8") as f:
        _PRICING = json.load(f)


async def _ensure_indexes() -> None:
    await db.users.create_index("email", unique=True, sparse=True)
    await db.users.create_index("user_id", unique=True)
    await db.users.create_index("phone", unique=True, sparse=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.pantry_items.create_index("user_id")
    await db.waste_log.create_index("user_id")
    await db.meal_plans.create_index([("user_id", 1), ("date", 1)], unique=True)
    await db.otp_codes.create_index(
        "created_at", expireAfterSeconds=600
    )  # 10 min
    await db.ai_weekly_plans.create_index(
        [("user_id", 1), ("week_start", 1)], unique=True
    )
    await db.habit_log.create_index(
        [("user_id", 1), ("habit", 1), ("date", 1)], unique=True
    )
    await db.habit_log.create_index([("user_id", 1), ("date", 1)])


@app.on_event("startup")
async def on_startup() -> None:
    logger.info("AmmiAI: seeding reference data...")
    try:
        n_ing = await _seed_ingredients()
        n_rec = await _seed_recipes()
        n_rules = await _seed_meal_rules()
        _load_pricing()
        await _ensure_indexes()
        logger.info(
            "AmmiAI: seeded ingredients=%s recipes=%s rules_groups=%s pricing=%s",
            n_ing, n_rec, n_rules, len(_PRICING),
        )
    except Exception as exc:
        logger.exception("AmmiAI: startup init failed: %s", exc)


# ------------------------- Helpers ------------------------- #
def _new_user_id() -> str:
    return f"user_{uuid.uuid4().hex[:12]}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _norm_dt(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _clean(doc: Optional[dict]) -> Optional[dict]:
    if doc is None:
        return None
    doc.pop("_id", None)
    return doc


async def get_current_user(
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1].strip()
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    exp = _norm_dt(session.get("expires_at"))
    if exp and exp < _now():
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def _create_session(user_id: str, token: Optional[str] = None) -> str:
    session_token = token or uuid.uuid4().hex
    await db.user_sessions.delete_many({"user_id": user_id})  # single active session
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "created_at": _now(),
        "expires_at": _now() + timedelta(days=7),
    })
    return session_token


# ------------------------- Public read endpoints ------------------------- #
@api_router.get("/")
async def root():
    return {"app": "AmmiAI", "status": "ok"}


@api_router.get("/stats")
async def get_stats():
    n_ing = await db.ingredients.count_documents({})
    n_rec = await db.recipes.count_documents({})
    n_rules = await db.meal_rules.count_documents({})
    categories: Dict[str, int] = {}
    async for doc in db.recipes.find({}, {"_id": 0, "category": 1}):
        cat = doc.get("category", "other")
        categories[cat] = categories.get(cat, 0) + 1
    return {
        "ingredients": n_ing,
        "recipes": n_rec,
        "meal_rule_docs": n_rules,
        "recipe_categories": categories,
    }


@api_router.get("/ingredients")
async def list_ingredients():
    return await db.ingredients.find({}, {"_id": 0}).to_list(1000)


@api_router.get("/ingredients/{ingredient_id}")
async def get_ingredient(ingredient_id: str):
    doc = await db.ingredients.find_one({"ingredient_id": ingredient_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    return doc


@api_router.get("/recipes")
async def list_recipes(
    category: Optional[str] = None,
    diet: Optional[str] = None,
    current=Depends(get_current_user),
):
    # Global recipes + this user's own custom dishes
    query: Dict[str, Any] = {
        "$or": [{"user_id": {"$exists": False}}, {"user_id": current["user_id"]}],
    }
    if category:
        query["category"] = category
    if diet:
        query["diet"] = diet
    return await db.recipes.find(query, {"_id": 0}).to_list(1200)


@api_router.get("/recipes/{recipe_id}")
async def get_recipe(recipe_id: str):
    doc = await db.recipes.find_one({"id": recipe_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return doc


@api_router.get("/meal-rules")
async def get_meal_rules():
    doc = await db.meal_rules.find_one({"key": "default"}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Meal rules not seeded")
    return doc


# ------------------------- Auth: Google (Emergent) ------------------------- #
class GoogleSessionIn(BaseModel):
    session_token: str  # session_token returned by Emergent session-data


@api_router.post("/auth/google/session")
async def google_session(payload: GoogleSessionIn):
    # Verify with Emergent
    async with httpx.AsyncClient(timeout=15) as http:
        r = await http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": payload.session_token},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session token")
    data = r.json()
    email = data.get("email")
    name = data.get("name") or "AmmiAI User"
    picture = data.get("picture")
    if not email:
        raise HTTPException(status_code=400, detail="No email in session")

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture, "last_login": _now()}},
        )
    else:
        user_id = _new_user_id()
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "auth_provider": "google",
            "created_at": _now(),
            "last_login": _now(),
        })

    token = await _create_session(user_id, token=payload.session_token)
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"session_token": token, "user": user}


# ------------------------- Auth: Phone OTP (mock) ------------------------- #
class PhoneSendIn(BaseModel):
    phone: str


class PhoneVerifyIn(BaseModel):
    phone: str
    code: str
    name: Optional[str] = None


@api_router.post("/auth/phone/send")
async def phone_send(payload: PhoneSendIn):
    phone = payload.phone.strip()
    if not re.fullmatch(r"\+?[0-9]{7,15}", phone):
        raise HTTPException(status_code=400, detail="Invalid phone number")
    # Mock: fixed code that main agent + testing can rely on
    await db.otp_codes.delete_many({"phone": phone})
    await db.otp_codes.insert_one({
        "phone": phone,
        "code": "123456",  # MOCKED — any 6-digit code will also be accepted
        "created_at": _now(),
    })
    return {"sent": True, "mock": True, "hint": "Use 123456 or any 6-digit code"}


@api_router.post("/auth/phone/verify")
async def phone_verify(payload: PhoneVerifyIn):
    phone = payload.phone.strip()
    code = payload.code.strip()
    if not re.fullmatch(r"[0-9]{6}", code):
        raise HTTPException(status_code=400, detail="Invalid code format")
    # MOCK: accept any 6-digit code, but require send was called
    otp = await db.otp_codes.find_one({"phone": phone}, {"_id": 0})
    if not otp:
        raise HTTPException(status_code=400, detail="Send OTP first")

    existing = await db.users.find_one({"phone": phone}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        update: Dict[str, Any] = {"last_login": _now()}
        if payload.name:
            update["name"] = payload.name
        await db.users.update_one({"user_id": user_id}, {"$set": update})
    else:
        user_id = _new_user_id()
        await db.users.insert_one({
            "user_id": user_id,
            "phone": phone,
            "name": payload.name or "AmmiAI User",
            "auth_provider": "phone",
            "created_at": _now(),
            "last_login": _now(),
        })

    await db.otp_codes.delete_many({"phone": phone})
    token = await _create_session(user_id)
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"session_token": token, "user": user}


@api_router.get("/auth/me")
async def auth_me(current=Depends(get_current_user)):
    profile = _clean(await db.profiles.find_one({"user_id": current["user_id"]}))
    return {"user": current, "profile": profile}


@api_router.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(default=None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        return {"ok": True}
    token = authorization.split(" ", 1)[1].strip()
    await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# ------------------------- Profile ------------------------- #
class HealthProfile(BaseModel):
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    target_weight_kg: Optional[float] = None  # goal weight; drives "Your path" pacing
    bmi: Optional[float] = None
    goals: List[str] = Field(default_factory=list)
    # B17 backbone: sex/age/activity personalise the ICMR base targets
    sex: Optional[str] = None            # "male" | "female"
    age_band: Optional[str] = None       # "18-30" | "31-45" | "46-60" | "60+"
    activity: Optional[str] = None       # "sedentary" | "moderate" | "active"


class ProfileIn(BaseModel):
    name: Optional[str] = None
    diet: Optional[str] = None  # veg / nonveg / eggetarian
    household_size: Optional[int] = None
    spice_level: Optional[str] = None  # mild / medium / hot
    favorites: List[str] = Field(default_factory=list)
    allergies: List[str] = Field(default_factory=list)  # e.g. ["no_onion_garlic","no_coconut"]
    custom_avoid: List[str] = Field(default_factory=list)
    health: Optional[HealthProfile] = None
    onboarding_complete: Optional[bool] = None


@api_router.get("/profile")
async def get_profile(current=Depends(get_current_user)):
    profile = _clean(await db.profiles.find_one({"user_id": current["user_id"]}))
    return profile or {"user_id": current["user_id"], "onboarding_complete": False}


@api_router.put("/profile")
async def put_profile(payload: ProfileIn, current=Depends(get_current_user)):
    update = payload.model_dump(exclude_none=True)
    if payload.name:
        await db.users.update_one(
            {"user_id": current["user_id"]}, {"$set": {"name": payload.name}}
        )
    update["user_id"] = current["user_id"]
    update["updated_at"] = _now()
    await db.profiles.update_one(
        {"user_id": current["user_id"]},
        {"$set": update, "$setOnInsert": {"created_at": _now()}},
        upsert=True,
    )
    return _clean(await db.profiles.find_one({"user_id": current["user_id"]}))


@api_router.post("/profile/reset")
async def profile_reset(current=Depends(get_current_user)):
    """Dev helper — clears the profile so onboarding runs again."""
    await db.profiles.delete_many({"user_id": current["user_id"]})
    await db.pantry_items.delete_many({"user_id": current["user_id"]})
    return {"ok": True}


# ------------------------- Pantry ------------------------- #
class PantryIn(BaseModel):
    ingredient_id: str
    qty: float
    unit: str
    storage: str = "pantry"  # pantry | fridge
    purchase_date: Optional[str] = None  # ISO date (yyyy-mm-dd)


class PantryPatch(BaseModel):
    qty: Optional[float] = None
    unit: Optional[str] = None
    storage: Optional[str] = None
    purchase_date: Optional[str] = None


BASIC_BUNDLE = [
    {"ingredient_id": "rice", "qty": 5, "unit": "kg", "storage": "pantry"},
    {"ingredient_id": "toor_dal", "qty": 1, "unit": "kg", "storage": "pantry"},
    {"ingredient_id": "urad_dal", "qty": 0.5, "unit": "kg", "storage": "pantry"},
    {"ingredient_id": "tamarind", "qty": 0.25, "unit": "kg", "storage": "pantry"},
    {"ingredient_id": "onion", "qty": 1, "unit": "kg", "storage": "pantry"},
    {"ingredient_id": "tomato", "qty": 0.5, "unit": "kg", "storage": "fridge"},
    {"ingredient_id": "cooking_oil", "qty": 1, "unit": "L", "storage": "pantry"},
    {"ingredient_id": "curd", "qty": 0.5, "unit": "L", "storage": "fridge"},
]


def _price_for(ingredient_id: str, qty: float, unit: str) -> Optional[float]:
    p = _PRICING.get(ingredient_id)
    if not p:
        return None
    per_unit = p["per_unit_inr"]
    base_unit = p["unit"]
    # Simple conversions
    u = unit.lower()
    if base_unit == "kg":
        if u in ("kg",):
            factor = qty
        elif u in ("g", "gm"):
            factor = qty / 1000.0
        else:
            return None
    elif base_unit == "L":
        if u in ("l", "ltr"):
            factor = qty
        elif u == "ml":
            factor = qty / 1000.0
        else:
            return None
    elif base_unit == "piece":
        if u in ("piece", "pc", "pcs", "no", "nos"):
            factor = qty
        else:
            return None
    else:
        return None
    return round(per_unit * factor, 2)


async def _enrich_item(item: Dict[str, Any]) -> Dict[str, Any]:
    ing = await db.ingredients.find_one(
        {"ingredient_id": item["ingredient_id"]}, {"_id": 0}
    )
    days_key = "fridge_days" if item.get("storage") == "fridge" else "pantry_days"
    shelf_days = (ing or {}).get(days_key)
    alert_days = (ing or {}).get("alert_before_days", 1)
    purchase = item.get("purchase_date")
    days_left = None
    if purchase and shelf_days is not None:
        try:
            pd = datetime.fromisoformat(purchase).replace(tzinfo=timezone.utc)
            expires = pd + timedelta(days=int(shelf_days))
            days_left = (expires.date() - _now().date()).days
        except Exception:
            days_left = None
    freshness = "unknown"
    if days_left is not None:
        if days_left <= 1:
            freshness = "red"
        elif days_left <= (alert_days or 1):
            freshness = "yellow"
        else:
            freshness = "green"
    item["ingredient_name"] = (ing or {}).get("name", item["ingredient_id"])
    item["category"] = (ing or {}).get("category", "other")
    item["shelf_days"] = shelf_days
    item["alert_before_days"] = alert_days
    item["days_left"] = days_left
    item["freshness"] = freshness
    return item


@api_router.get("/pantry")
async def list_pantry(current=Depends(get_current_user)):
    docs = await db.pantry_items.find(
        {"user_id": current["user_id"]}, {"_id": 0}
    ).to_list(1000)
    return [await _enrich_item(d) for d in docs]


async def _is_premium(user_id: str) -> bool:
    p = await db.premium.find_one({"user_id": user_id}, {"_id": 0})
    if not p or not p.get("is_premium"):
        return False
    exp = _norm_dt(p.get("expires_at"))
    if exp and exp < _now():
        await db.premium.update_one({"user_id": user_id}, {"$set": {"is_premium": False}})
        return False
    return True


@api_router.post("/pantry")
async def add_pantry(payload: PantryIn, current=Depends(get_current_user)):
    ing = await db.ingredients.find_one({"ingredient_id": payload.ingredient_id})
    if not ing:
        raise HTTPException(status_code=404, detail="Unknown ingredient")
    if not await _is_premium(current["user_id"]):
        n = await db.pantry_items.count_documents({"user_id": current["user_id"]})
        if n >= 25:
            raise HTTPException(
                status_code=402,
                detail="Free plan limit: 25 pantry items. Upgrade to premium for unlimited.",
            )
    item = {
        "id": uuid.uuid4().hex,
        "user_id": current["user_id"],
        "ingredient_id": payload.ingredient_id,
        "qty": payload.qty,
        "unit": payload.unit,
        "storage": payload.storage,
        "purchase_date": payload.purchase_date or _now().date().isoformat(),
        "created_at": _now(),
    }
    await db.pantry_items.insert_one(item)
    item.pop("_id", None)
    return await _enrich_item(item)


@api_router.post("/pantry/bundle")
async def add_bundle(current=Depends(get_current_user)):
    """One-tap Basic Tamil Kitchen."""
    today = _now().date().isoformat()
    inserted = []
    for it in BASIC_BUNDLE:
        # skip if this exact ingredient already exists
        exists = await db.pantry_items.find_one(
            {"user_id": current["user_id"], "ingredient_id": it["ingredient_id"]}
        )
        if exists:
            continue
        doc = {
            "id": uuid.uuid4().hex,
            "user_id": current["user_id"],
            **it,
            "purchase_date": today,
            "created_at": _now(),
        }
        await db.pantry_items.insert_one(doc)
        doc.pop("_id", None)
        inserted.append(await _enrich_item(doc))
    return {"added": len(inserted), "items": inserted}


@api_router.patch("/pantry/{item_id}")
async def patch_pantry(item_id: str, payload: PantryPatch, current=Depends(get_current_user)):
    update = payload.model_dump(exclude_none=True)
    if not update:
        raise HTTPException(status_code=400, detail="No fields")
    res = await db.pantry_items.update_one(
        {"id": item_id, "user_id": current["user_id"]}, {"$set": update}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    doc = await db.pantry_items.find_one(
        {"id": item_id, "user_id": current["user_id"]}, {"_id": 0}
    )
    return await _enrich_item(doc)


@api_router.delete("/pantry/{item_id}")
async def delete_pantry(item_id: str, current=Depends(get_current_user)):
    res = await db.pantry_items.delete_one(
        {"id": item_id, "user_id": current["user_id"]}
    )
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


class DiscardIn(BaseModel):
    reason: Optional[str] = "expired"


@api_router.post("/pantry/{item_id}/discard")
async def discard_pantry(item_id: str, payload: DiscardIn, current=Depends(get_current_user)):
    item = await db.pantry_items.find_one(
        {"id": item_id, "user_id": current["user_id"]}, {"_id": 0}
    )
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    estimated = _price_for(item["ingredient_id"], item["qty"], item["unit"])
    ing = await db.ingredients.find_one(
        {"ingredient_id": item["ingredient_id"]}, {"_id": 0}
    )
    log_doc = {
        "id": uuid.uuid4().hex,
        "user_id": current["user_id"],
        "ingredient_id": item["ingredient_id"],
        "ingredient_name": (ing or {}).get("name", item["ingredient_id"]),
        "qty": item["qty"],
        "unit": item["unit"],
        "reason": payload.reason,
        "estimated_inr": estimated,
        "discarded_at": _now(),
    }
    await db.waste_log.insert_one(log_doc)
    await db.pantry_items.delete_one({"id": item_id, "user_id": current["user_id"]})
    log_doc.pop("_id", None)
    return log_doc


@api_router.get("/waste-log")
async def get_waste_log(current=Depends(get_current_user)):
    docs = await db.waste_log.find(
        {"user_id": current["user_id"]}, {"_id": 0}
    ).sort("discarded_at", -1).to_list(500)
    total = sum((d.get("estimated_inr") or 0) for d in docs)
    return {"items": docs, "total_estimated_inr": round(total, 2)}


# ------------------------- Meal Plan Engine ------------------------- #
async def _build_context(user_id: str, seed: Optional[int] = None) -> PlannerContext:
    profile = await db.profiles.find_one({"user_id": user_id}, {"_id": 0}) or {}
    rules_doc = await db.meal_rules.find_one({"key": "default"}, {"_id": 0}) or {}
    recipes = await db.recipes.find({}, {"_id": 0}).to_list(1000)
    pantry_raw = await db.pantry_items.find(
        {"user_id": user_id}, {"_id": 0}
    ).to_list(1000)
    pantry_items = [await _enrich_item(dict(it)) for it in pantry_raw]
    pantry = PantrySnapshot.from_items(pantry_items)
    # 7-day rolling history of dish IDs for variety
    week_docs = await db.meal_plans.find(
        {"user_id": user_id}
    ).sort("date", -1).limit(7).to_list(7)
    week_ids: List[str] = []
    for doc in week_docs:
        for m in ("breakfast", "lunch", "dinner"):
            for it in doc.get(m, {}).get("items", []):
                rid = it.get("id")
                if rid and not it.get("static"):
                    week_ids.append(rid)
    return PlannerContext(
        rules=rules_doc,
        recipes=recipes,
        profile=profile,
        pantry=pantry,
        week_ids=week_ids,
        seed=seed,
    )


def _sanitize_plan(plan: Dict[str, Any]) -> Dict[str, Any]:
    """Convert set() etc to JSON-serializable primitives; strip Mongo _id."""
    def _walk(v):
        if isinstance(v, dict):
            return {k: _walk(x) for k, x in v.items() if k != "_id"}
        if isinstance(v, list):
            return [_walk(x) for x in v]
        if isinstance(v, set):
            return list(v)
        return v
    return _walk(plan)


class GenerateIn(BaseModel):
    date: Optional[str] = None  # yyyy-mm-dd; default today
    seed: Optional[int] = None
    force: bool = False


@api_router.post("/plan/generate")
async def plan_generate(payload: GenerateIn, current=Depends(get_current_user)):
    date = payload.date or _now().date().isoformat()
    if not payload.force:
        existing = await db.meal_plans.find_one(
            {"user_id": current["user_id"], "date": date}, {"_id": 0}
        )
        if existing:
            return existing
    # Quota check on new generations (force or new day)
    if not await _is_premium(current["user_id"]):
        start_month = _now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        n = await db.plan_gen_log.count_documents(
            {"user_id": current["user_id"], "at": {"$gte": start_month}}
        )
        if n >= 4:
            raise HTTPException(
                status_code=402,
                detail="Free plan limit: 4 plan generations per month. Upgrade to premium for unlimited.",
            )
    seed = payload.seed if payload.seed is not None else int(_now().timestamp())
    ctx = await _build_context(current["user_id"], seed=seed)
    plan = engine_plan_day(ctx)
    plan = _sanitize_plan(plan)
    plan["user_id"] = current["user_id"]
    plan["date"] = date
    plan["updated_at"] = _now()
    await db.meal_plans.replace_one(
        {"user_id": current["user_id"], "date": date}, plan, upsert=True
    )
    await db.plan_gen_log.insert_one({"user_id": current["user_id"], "at": _now()})
    return _clean(await db.meal_plans.find_one(
        {"user_id": current["user_id"], "date": date}
    ))


@api_router.get("/plan/today")
async def plan_today(current=Depends(get_current_user)):
    date = _now().date().isoformat()
    doc = await db.meal_plans.find_one(
        {"user_id": current["user_id"], "date": date}, {"_id": 0}
    )
    if doc:
        return doc
    # Auto-generate a fresh plan on first read
    ctx = await _build_context(current["user_id"], seed=int(_now().timestamp()))
    plan = engine_plan_day(ctx)
    plan = _sanitize_plan(plan)
    plan["user_id"] = current["user_id"]
    plan["date"] = date
    plan["updated_at"] = _now()
    await db.meal_plans.replace_one(
        {"user_id": current["user_id"], "date": date}, plan, upsert=True
    )
    return _clean(await db.meal_plans.find_one(
        {"user_id": current["user_id"], "date": date}
    ))


@api_router.get("/plan/week")
async def plan_week(current=Depends(get_current_user)):
    """Return today + next 6 days. Missing days are generated on the fly."""
    from datetime import date as _dt_date
    today = _now().date()
    out: List[Dict[str, Any]] = []
    for i in range(7):
        d = (today + timedelta(days=i)).isoformat()
        doc = await db.meal_plans.find_one(
            {"user_id": current["user_id"], "date": d}, {"_id": 0}
        )
        if not doc:
            ctx = await _build_context(current["user_id"], seed=int(_now().timestamp()) + i)
            plan = engine_plan_day(ctx)
            plan = _sanitize_plan(plan)
            plan["user_id"] = current["user_id"]
            plan["date"] = d
            plan["updated_at"] = _now()
            await db.meal_plans.replace_one(
                {"user_id": current["user_id"], "date": d}, plan, upsert=True
            )
            doc = await db.meal_plans.find_one(
                {"user_id": current["user_id"], "date": d}, {"_id": 0}
            )
        out.append(doc)
    return {"days": out}


class SwapIn(BaseModel):
    date: str
    meal: str  # breakfast | lunch | dinner
    current_recipe_id: str
    new_recipe_id: str


def _detect_swap_violations(
    doc: Dict[str, Any],
    meal_key: str,
    current_recipe_id: str,
    new_recipe: Dict[str, Any],
    rules: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Return list of {rule, message, suggested_fix} for a manual swap.

    The user is allowed to keep the swap; violations are surfaced as warnings.
    """
    from meal_engine import _dish_veggie, _rules_lookup

    violations: List[Dict[str, Any]] = []
    meal = doc.get(meal_key, {})
    items = [it for it in meal.get("items", []) if it.get("id") != current_recipe_id]
    nid = new_recipe["id"]

    # sour
    sour = _rules_lookup(rules, "max_sour_dishes_per_meal")
    sour_ids = set(sour.get("sour_ids", []))
    max_sour = int(sour.get("value", 1))
    if nid in sour_ids:
        cur = sum(1 for c in items if c.get("id") in sour_ids)
        if cur >= max_sour:
            violations.append(
                {
                    "rule": "max_sour_dishes_per_meal",
                    "message": "Too many sour dishes in this meal.",
                    "suggested_fix": "Pick a non-sour alternative (e.g., a mor kuzhambu or paruppu kuzhambu).",
                }
            )

    # coconut
    coco = _rules_lookup(rules, "max_coconut_heavy_per_meal")
    coco_ids = set(coco.get("coconut_ids", []))
    max_coco = int(coco.get("value", 2))
    if nid in coco_ids:
        cur = sum(1 for c in items if c.get("id") in coco_ids)
        if cur >= max_coco:
            violations.append(
                {
                    "rule": "max_coconut_heavy_per_meal",
                    "message": "Too many coconut-heavy dishes in this meal.",
                    "suggested_fix": "Swap one coconut-heavy dish for a rasam or a plain poriyal.",
                }
            )

    # same veg once per day
    new_veg = _dish_veggie(new_recipe)
    if new_veg:
        day_veggies: set[str] = set()
        for mk in ("breakfast", "lunch", "dinner"):
            for it in doc.get(mk, {}).get("items", []):
                if it.get("id") == current_recipe_id and mk == meal_key:
                    continue
                v = _dish_veggie(it)
                if v:
                    day_veggies.add(v)
        if new_veg in day_veggies:
            violations.append(
                {
                    "rule": "same_veggie_once_per_day",
                    "message": f"{new_veg.replace('_',' ').title()} already appears elsewhere today.",
                    "suggested_fix": "Choose a dish featuring a different vegetable.",
                }
            )

    # curd with fish
    fish_ids = {"nv_meen_kuzhambu", "nv_meen_varuval", "nv_era_thokku"}
    has_curd = any(
        c.get("id") == "static_curd"
        for mk in ("breakfast", "lunch", "dinner")
        for c in doc.get(mk, {}).get("items", [])
        if not (c.get("id") == current_recipe_id and mk == meal_key)
    )
    if nid in fish_ids and has_curd:
        violations.append(
            {
                "rule": "no_curd_with_fish",
                "message": "Curd + fish is discouraged in Tamil cuisine.",
                "suggested_fix": "Remove the curd side or pick a non-fish gravy.",
            }
        )

    return violations


@api_router.post("/plan/swap")
async def plan_swap(payload: SwapIn, current=Depends(get_current_user)):
    doc = await db.meal_plans.find_one(
        {"user_id": current["user_id"], "date": payload.date}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Plan not found")
    if payload.meal not in doc:
        raise HTTPException(status_code=400, detail="Unknown meal")
    recipes = {r["id"]: r for r in await db.recipes.find({}, {"_id": 0}).to_list(1000)}
    new_recipe = recipes.get(payload.new_recipe_id)
    if not new_recipe:
        raise HTTPException(status_code=404, detail="New recipe not found")

    rules = await db.meal_rules.find_one({"key": "default"}, {"_id": 0}) or {}
    violations = _detect_swap_violations(
        doc, payload.meal, payload.current_recipe_id, new_recipe, rules
    )

    meal = doc[payload.meal]
    items = meal.get("items", [])
    found = False
    for i, it in enumerate(items):
        if it.get("id") == payload.current_recipe_id:
            items[i] = new_recipe
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="Current dish not in meal")
    meal["items"] = items
    from meal_engine import meal_status, sum_nutrition

    tpl = meal.get("template", payload.meal)
    meal.update(meal_status(items, tpl, rules))
    doc[payload.meal] = meal

    all_items = doc["breakfast"]["items"] + doc["lunch"]["items"] + doc["dinner"]["items"]
    totals = sum_nutrition(all_items)
    profile = await db.profiles.find_one({"user_id": current["user_id"]}, {"_id": 0}) or {}
    targets = daily_targets(rules, profile)
    doc["day_totals"] = totals
    doc["day_targets"] = targets
    doc["rings"] = {
        "kcal": min(1.0, round(totals["kcal"] / max(1, targets["kcal"]), 3)),
        "protein_g": min(1.0, round(totals["protein_g"] / max(1, targets["protein_g"]), 3)),
        "fiber_g": min(1.0, round(totals["fiber_g"] / max(1, targets["fiber_g"]), 3)),
    }
    doc["manual_edits"] = doc.get("manual_edits", 0) + 1
    doc["updated_at"] = _now()
    await db.meal_plans.replace_one(
        {"user_id": current["user_id"], "date": payload.date}, doc, upsert=True
    )
    saved = _clean(await db.meal_plans.find_one(
        {"user_id": current["user_id"], "date": payload.date}
    ))
    if isinstance(saved, dict):
        saved["violations"] = violations
    return saved


class RemoveDishIn(BaseModel):
    date: str
    meal: str
    recipe_id: str


@api_router.post("/plan/remove-dish")
async def plan_remove_dish(payload: RemoveDishIn, current=Depends(get_current_user)):
    """Let the user delete a dish from a meal slot outright (no replacement)."""
    doc = await db.meal_plans.find_one(
        {"user_id": current["user_id"], "date": payload.date}, {"_id": 0}
    )
    if not doc or payload.meal not in doc:
        raise HTTPException(status_code=404, detail="Plan not found")
    meal = doc[payload.meal]
    items = meal.get("items", [])
    # User feedback: base items (rice/curd) must also be removable — it's the
    # user's plate. Any item can be removed by id now.
    new_items = [it for it in items if it.get("id") != payload.recipe_id]
    if len(new_items) == len(items):
        raise HTTPException(status_code=404, detail="Dish not found in this meal")
    meal["items"] = new_items
    from meal_engine import meal_status, sum_nutrition

    rules = await db.meal_rules.find_one({"key": "default"}, {"_id": 0}) or {}
    tpl = meal.get("template", payload.meal)
    meal.update(meal_status(new_items, tpl, rules))
    doc[payload.meal] = meal
    all_items = doc["breakfast"]["items"] + doc["lunch"]["items"] + doc["dinner"]["items"]
    totals = sum_nutrition(all_items)
    profile = await db.profiles.find_one({"user_id": current["user_id"]}, {"_id": 0}) or {}
    targets = daily_targets(rules, profile)
    doc["day_totals"] = totals
    doc["day_targets"] = targets
    doc["rings"] = {
        "kcal": min(1.0, round(totals["kcal"] / max(1, targets["kcal"]), 3)),
        "protein_g": min(1.0, round(totals["protein_g"] / max(1, targets["protein_g"]), 3)),
        "fiber_g": min(1.0, round(totals["fiber_g"] / max(1, targets["fiber_g"]), 3)),
    }
    doc["manual_edits"] = doc.get("manual_edits", 0) + 1
    doc["updated_at"] = _now()
    await db.meal_plans.replace_one(
        {"user_id": current["user_id"], "date": payload.date}, doc, upsert=True
    )
    return _clean(await db.meal_plans.find_one(
        {"user_id": current["user_id"], "date": payload.date}
    ))


class AddDishIn(BaseModel):
    date: str
    meal: str
    recipe_id: str


@api_router.get("/plan/add-dish-options")
async def plan_add_dish_options(
    date: str,
    meal: str,
    q: Optional[str] = None,
    current=Depends(get_current_user),
):
    """Searchable list of dishes a user can manually add to a meal slot."""
    profile = await db.profiles.find_one({"user_id": current["user_id"]}, {"_id": 0}) or {}
    diet = profile.get("diet", "veg")
    allergies = set(profile.get("allergies", []) or [])
    recipes = await db.recipes.find({}, {"_id": 0}).to_list(1000)
    ctx = await _build_context(current["user_id"])
    pantry_have = ctx.pantry.have if hasattr(ctx, "pantry") else set()

    def diet_ok(r):
        if diet == "veg":
            return r.get("diet") in ("veg",)
        if diet == "egg":
            return r.get("diet") in ("veg", "egg")
        return True

    def allergy_ok(r):
        ids = {i.get("ingredient_id") for i in r.get("ingredients", [])}
        return not (ids & allergies)

    out = []
    ql = (q or "").strip().lower()
    for r in recipes:
        if not diet_ok(r) or not allergy_ok(r):
            continue
        if ql and ql not in r.get("name_en", "").lower() and ql not in r.get("name_ta", "").lower():
            continue
        req = [i["ingredient_id"] for i in r.get("ingredients", []) if i["ingredient_id"] not in STAPLE_ALWAYS]
        have_n = sum(1 for i in req if i in pantry_have)
        out.append({
            **r,
            "_score": {
                "pantry_ratio": (have_n / len(req)) if req else 1.0,
                "zero_shop": bool(req) and have_n == len(req),
            },
        })
    out.sort(key=lambda r: (-r["_score"]["pantry_ratio"], r["name_en"]))
    return {"options": out[:40]}


@api_router.post("/plan/add-dish")
async def plan_add_dish(payload: AddDishIn, current=Depends(get_current_user)):
    doc = await db.meal_plans.find_one(
        {"user_id": current["user_id"], "date": payload.date}, {"_id": 0}
    )
    if not doc or payload.meal not in doc:
        raise HTTPException(status_code=404, detail="Plan not found")
    recipe = await db.recipes.find_one({"id": payload.recipe_id}, {"_id": 0})
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    meal = doc[payload.meal]
    items = meal.get("items", [])
    if any(it.get("id") == payload.recipe_id for it in items):
        raise HTTPException(status_code=400, detail="Already in this meal")
    items.append(recipe)
    meal["items"] = items
    from meal_engine import meal_status, sum_nutrition

    rules = await db.meal_rules.find_one({"key": "default"}, {"_id": 0}) or {}
    tpl = meal.get("template", payload.meal)
    meal.update(meal_status(items, tpl, rules))
    doc[payload.meal] = meal
    all_items = doc["breakfast"]["items"] + doc["lunch"]["items"] + doc["dinner"]["items"]
    totals = sum_nutrition(all_items)
    profile = await db.profiles.find_one({"user_id": current["user_id"]}, {"_id": 0}) or {}
    targets = daily_targets(rules, profile)
    doc["day_totals"] = totals
    doc["day_targets"] = targets
    doc["rings"] = {
        "kcal": min(1.0, round(totals["kcal"] / max(1, targets["kcal"]), 3)),
        "protein_g": min(1.0, round(totals["protein_g"] / max(1, targets["protein_g"]), 3)),
        "fiber_g": min(1.0, round(totals["fiber_g"] / max(1, targets["fiber_g"]), 3)),
    }
    doc["manual_edits"] = doc.get("manual_edits", 0) + 1
    doc["updated_at"] = _now()
    await db.meal_plans.replace_one(
        {"user_id": current["user_id"], "date": payload.date}, doc, upsert=True
    )
    return _clean(await db.meal_plans.find_one(
        {"user_id": current["user_id"], "date": payload.date}
    ))


class BulkGenerateIn(BaseModel):
    start_date: str  # yyyy-mm-dd
    end_date: str    # yyyy-mm-dd (inclusive)
    only_empty: bool = True


@api_router.post("/plan/bulk-generate")
async def plan_bulk_generate(payload: BulkGenerateIn, current=Depends(get_current_user)):
    from datetime import date as _dt_date
    try:
        start = _dt_date.fromisoformat(payload.start_date)
        end = _dt_date.fromisoformat(payload.end_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date")
    if end < start:
        raise HTTPException(status_code=400, detail="end < start")
    if (end - start).days > 45:
        raise HTTPException(status_code=400, detail="Range too large (max 45 days)")

    created: List[str] = []
    skipped: List[str] = []
    cursor = start
    seed_base = int(_now().timestamp())
    while cursor <= end:
        d = cursor.isoformat()
        existing = await db.meal_plans.find_one(
            {"user_id": current["user_id"], "date": d}, {"_id": 0}
        )
        if existing and payload.only_empty:
            skipped.append(d)
            cursor = cursor + timedelta(days=1)
            continue
        seed = seed_base + (cursor - start).days
        ctx = await _build_context(current["user_id"], seed=seed)
        plan = engine_plan_day(ctx)
        plan = _sanitize_plan(plan)
        plan["user_id"] = current["user_id"]
        plan["date"] = d
        plan["updated_at"] = _now()
        await db.meal_plans.replace_one(
            {"user_id": current["user_id"], "date": d}, plan, upsert=True
        )
        created.append(d)
        cursor = cursor + timedelta(days=1)
    return {"created": created, "skipped": skipped}


@api_router.get("/plan/month")
async def plan_month(
    year: int,
    month: int,
    current=Depends(get_current_user),
):
    """Return every existing plan doc for the given calendar month."""
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Invalid month")
    from calendar import monthrange
    days_in = monthrange(year, month)[1]
    start = f"{year:04d}-{month:02d}-01"
    end = f"{year:04d}-{month:02d}-{days_in:02d}"
    docs = await db.meal_plans.find(
        {
            "user_id": current["user_id"],
            "date": {"$gte": start, "$lte": end},
        },
        {"_id": 0},
    ).sort("date", 1).to_list(50)
    plans: Dict[str, Any] = {d["date"]: d for d in docs}
    return {"year": year, "month": month, "days_in_month": days_in, "plans": plans}


@api_router.get("/plan/swap-options")
async def plan_swap_options(
    date: str,
    meal: str,
    recipe_id: str,
    current=Depends(get_current_user),
):
    doc = await db.meal_plans.find_one(
        {"user_id": current["user_id"], "date": date}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Plan not found")
    ctx = await _build_context(current["user_id"])
    opts = engine_swap_options(ctx, doc, meal, recipe_id, limit=3)
    return {"options": opts}


@api_router.get("/plan/nutrition-targets")
async def plan_targets(current=Depends(get_current_user)):
    profile = await db.profiles.find_one({"user_id": current["user_id"]}, {"_id": 0}) or {}
    rules = await db.meal_rules.find_one({"key": "default"}, {"_id": 0}) or {}
    return daily_targets(rules, profile)


@api_router.get("/rescue-dishes")
async def get_rescue(current=Depends(get_current_user)):
    ctx = await _build_context(current["user_id"])
    return {"items": engine_rescue(ctx, limit=8)}


@api_router.get("/cook-now")
async def get_cook_now(current=Depends(get_current_user)):
    ctx = await _build_context(current["user_id"])
    return {"items": engine_cook_now(ctx, limit=8)}


# ------------------------- Grocery ------------------------- #
# Ingredients marked as "always at home" — not added to shopping list even if
# recipes reference them (mirror STAPLE_ALWAYS from meal_engine).
_GROCERY_STAPLES = {
    "salt", "sugar", "turmeric_powder", "mustard_seeds", "cumin_seeds",
    "asafoetida", "fenugreek_seeds", "red_chili_powder", "coriander_powder",
    "sambar_powder", "rasam_powder", "curry_leaves",
}

# Normalize any (qty, unit) pair to grams (mass), millilitres (volume) or piece.
def _to_base(qty: float, unit: str) -> tuple[float, str]:
    u = unit.lower().strip()
    if u in ("g", "gm"):
        return qty, "g"
    if u == "kg":
        return qty * 1000.0, "g"
    if u == "ml":
        return qty, "ml"
    if u in ("l", "ltr"):
        return qty * 1000.0, "ml"
    if u in ("piece", "pc", "pcs", "no", "nos"):
        return qty, "piece"
    return qty, u  # unknown — leave as-is


def _from_base(qty_base: float, base_unit: str) -> tuple[float, str]:
    """Round-trip base -> friendly display unit."""
    if base_unit == "g":
        return (round(qty_base / 1000.0, 2), "kg") if qty_base >= 1000 else (round(qty_base), "g")
    if base_unit == "ml":
        return (round(qty_base / 1000.0, 2), "L") if qty_base >= 1000 else (round(qty_base), "ml")
    return round(qty_base, 1), base_unit


def _grocery_category(ing: Dict[str, Any]) -> str:
    """Map shelf_life category → user-friendly bucket (matches pantry groups)."""
    c = (ing.get("category") or "").lower()
    if "leaf" in c or c == "herb":
        return "Leafy & Herbs"
    if c in ("vegetable", "fruit"):
        return "Vegetables"
    if c == "dairy":
        return "Dairy"
    if c in ("meat", "seafood", "egg"):
        return "Protein"
    if c in ("staple", "lentil"):
        return "Staples"
    if c in ("spice", "condiment", "oil"):
        return "Spices & Oils"
    return "Other"


class GroceryQuery(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    days: Optional[int] = 7  # convenience: if start/end omitted, next N days from today


@api_router.get("/grocery/list")
async def grocery_list(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    days: int = 7,
    current=Depends(get_current_user),
):
    from datetime import date as _dt_date
    today = _now().date()
    if start_date:
        start = _dt_date.fromisoformat(start_date)
    else:
        start = today
    if end_date:
        end = _dt_date.fromisoformat(end_date)
    else:
        end = start + timedelta(days=max(0, days - 1))
    if end < start:
        raise HTTPException(status_code=400, detail="end < start")

    # Load plans in range
    plans = await db.meal_plans.find(
        {
            "user_id": current["user_id"],
            "date": {"$gte": start.isoformat(), "$lte": end.isoformat()},
        },
        {"_id": 0},
    ).sort("date", 1).to_list(60)

    profile = await db.profiles.find_one({"user_id": current["user_id"]}, {"_id": 0}) or {}
    household = max(1, int(profile.get("household_size", 1)))

    # Sum required ingredients across all planned meals × household_size.
    required: Dict[str, Dict[str, Any]] = {}  # ing_id -> {qty_base, unit_base}
    for p in plans:
        for mk in ("breakfast", "lunch", "dinner"):
            for it in p.get(mk, {}).get("items", []):
                if it.get("static"):
                    continue
                # Get recipe def with ingredients (plan doc includes ingredients as inserted)
                for ing in it.get("ingredients", []) or []:
                    iid = ing.get("ingredient_id")
                    if not iid or iid in _GROCERY_STAPLES:
                        continue
                    q, u = _to_base(float(ing.get("qty", 0)) * household, ing.get("unit", "g"))
                    if iid not in required:
                        required[iid] = {"qty": 0.0, "unit_base": u}
                    if required[iid]["unit_base"] != u:
                        # unit mismatch (e.g., piece vs g) — skip conflict
                        continue
                    required[iid]["qty"] += q

    # Current pantry stock per ingredient (converted to base)
    pantry_rows = await db.pantry_items.find(
        {"user_id": current["user_id"]}, {"_id": 0}
    ).to_list(1000)
    have: Dict[str, Dict[str, Any]] = {}
    for row in pantry_rows:
        iid = row["ingredient_id"]
        q, u = _to_base(float(row.get("qty", 0)), row.get("unit", "g"))
        if iid not in have:
            have[iid] = {"qty": 0.0, "unit_base": u}
        if have[iid]["unit_base"] == u:
            have[iid]["qty"] += q

    # Enrich with ingredient display data
    ingredients = {
        i["ingredient_id"]: i
        for i in await db.ingredients.find({}, {"_id": 0}).to_list(1000)
    }

    items_by_cat: Dict[str, List[Dict[str, Any]]] = {}
    covered_items: List[Dict[str, Any]] = []
    total_estimated_inr = 0.0
    for iid, need in sorted(required.items()):
        pantry_q = have.get(iid, {}).get("qty", 0.0)
        pantry_unit = have.get(iid, {}).get("unit_base")
        deficit = need["qty"]
        if pantry_unit == need["unit_base"]:
            deficit = max(0.0, need["qty"] - pantry_q)
        if deficit <= 0:
            # Fully covered by pantry — surface it so the app can show the
            # "auto-magic" (plan → pantry check → buy only the gap).
            ing_c = ingredients.get(iid, {})
            dq, du = _from_base(need["qty"], need["unit_base"])
            covered_items.append({
                "ingredient_id": iid,
                "name": ing_c.get("name", iid.replace("_", " ").title()),
                "need_qty": dq,
                "unit": du,
            })
            continue
        disp_qty, disp_unit = _from_base(deficit, need["unit_base"])
        # Nice rounding to shopping increments
        if need["unit_base"] == "g":
            # round up to nearest 100g (min 100g)
            grams = deficit
            grams = max(100, int(((grams + 99) // 100) * 100))
            disp_qty, disp_unit = _from_base(grams, "g")
        elif need["unit_base"] == "ml":
            ml = deficit
            ml = max(100, int(((ml + 99) // 100) * 100))
            disp_qty, disp_unit = _from_base(ml, "ml")
        ing = ingredients.get(iid, {})
        price = _price_for(iid, disp_qty, disp_unit)
        if price:
            total_estimated_inr += price
        cat = _grocery_category(ing)
        items_by_cat.setdefault(cat, []).append(
            {
                "ingredient_id": iid,
                "name": ing.get("name", iid.replace("_", " ").title()),
                "category": cat,
                "qty": disp_qty,
                "unit": disp_unit,
                "estimated_inr": round(price, 2) if price else None,
                "need_base": round(need["qty"], 1),
                "have_base": round(pantry_q, 1),
                "base_unit": need["unit_base"],
            }
        )

    # Category order
    order = ["Leafy & Herbs", "Vegetables", "Protein", "Dairy", "Staples", "Spices & Oils", "Other"]
    groups = [
        {"category": c, "items": items_by_cat[c]}
        for c in order
        if c in items_by_cat
    ]

    # Apply user overrides: removed items disappear, manual adds are appended.
    overrides = await db.grocery_overrides.find_one(
        {"user_id": current["user_id"]}, {"_id": 0}
    ) or {"removed": [], "manual": []}
    removed = set(overrides.get("removed", []))
    if removed:
        for g in groups:
            g["items"] = [it for it in g["items"] if it["ingredient_id"] not in removed]
        groups = [g for g in groups if g["items"]]

    for m in overrides.get("manual", []):
        ing = ingredients.get(m["ingredient_id"], {})
        cat = _grocery_category(ing)
        price = _price_for(m["ingredient_id"], m["qty"], m["unit"])
        row = {
            "ingredient_id": m["ingredient_id"],
            "name": ing.get("name", m["ingredient_id"].replace("_", " ").title()),
            "category": cat,
            "qty": m["qty"],
            "unit": m["unit"],
            "estimated_inr": round(price, 2) if price else None,
            "manual": True,
        }
        if price:
            total_estimated_inr += price
        target = next((g for g in groups if g["category"] == cat), None)
        if target:
            target["items"].append(row)
        else:
            groups.append({"category": cat, "items": [row]})

    return {
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "household_size": household,
        "days_covered": len(plans),
        "groups": groups,
        "total_items": sum(len(g["items"]) for g in groups),
        "total_estimated_inr": round(total_estimated_inr, 2),
        "covered_items": covered_items,  # already in pantry — nothing to buy
    }


# ---------- B17: health -> grocery suggestion (the backbone head) ---------- #
_HEALTH_RULES: Dict[str, Any] = {}

def _health_rules() -> Dict[str, Any]:
    global _HEALTH_RULES
    if not _HEALTH_RULES:
        with open(DATA_DIR / "health_focus_rules.json", "r", encoding="utf-8") as f:
            _HEALTH_RULES = json.load(f)
    return _HEALTH_RULES


# ---------- Bulk chain: pantry -> dishes, and health-focus -> supportive dishes ---------- #
@api_router.get("/dishes/from-pantry")
async def dishes_from_pantry(current=Depends(get_current_user)):
    """THE pantry->dish chain, made visible. For each dish, compute how much of
    its ingredients the user already has in pantry, and rank by readiness."""
    profile = await db.profiles.find_one({"user_id": current["user_id"]}, {"_id": 0}) or {}
    diet = profile.get("diet") or "veg"
    allergies = set((profile.get("allergies") or []) + (profile.get("custom_avoid") or []))
    pantry = {p["ingredient_id"] async for p in db.pantry.find({"user_id": current["user_id"]}, {"ingredient_id": 1})}
    recipes = await db.recipes.find({}, {"_id": 0}).to_list(500)

    DIET_OK = {"veg": {"veg"}, "egg": {"veg", "egg"}, "nonveg": {"veg", "egg", "nonveg"}}
    allowed = DIET_OK.get(diet, {"veg"})

    out = []
    for r in recipes:
        if r.get("diet") not in allowed:
            continue
        ing_ids = [i["ingredient_id"] for i in r.get("ingredients", [])]
        if allergies & set(ing_ids):
            continue
        need = [i for i in ing_ids if i not in STAPLE_ALWAYS]
        have = [i for i in need if i in pantry]
        missing = [i for i in need if i not in pantry]
        readiness = round(100 * len(have) / len(need)) if need else 100
        out.append({
            "id": r["id"], "name": r.get("name_en"), "name_ta": r.get("name_ta"),
            "category": r.get("category"), "nutrition": r.get("nutrition", {}),
            "health_tags": r.get("health_tags", []),
            "readiness": readiness,
            "have": have, "missing": missing,
        })
    out.sort(key=lambda d: -d["readiness"])
    return {"dishes": out[:40], "pantry_count": len(pantry)}


@api_router.get("/dishes/for-health")
async def dishes_for_health(current=Depends(get_current_user)):
    """Health-focus -> SUPPORTIVE dishes (never 'curative'). Maps the user's
    focus areas to dishes tagged/ingredient-matched for that focus."""
    profile = await db.profiles.find_one({"user_id": current["user_id"]}, {"_id": 0}) or {}
    goals = list((profile.get("health") or {}).get("goals") or []) or ["balanced"]
    diet = profile.get("diet") or "veg"
    allergies = set((profile.get("allergies") or []) + (profile.get("custom_avoid") or []))
    rules = _health_rules().get("focuses", {})
    recipes = await db.recipes.find({}, {"_id": 0}).to_list(500)

    DIET_OK = {"veg": {"veg"}, "egg": {"veg", "egg"}, "nonveg": {"veg", "egg", "nonveg"}}
    allowed = DIET_OK.get(diet, {"veg"})

    groups = []
    for g in goals:
        f = rules.get(g)
        if not f:
            continue
        want_tags = set(f.get("recipe_tags", []))
        favour = set(f.get("grocery_favour", []))
        picks = []
        for r in recipes:
            if r.get("diet") not in allowed:
                continue
            ing_ids = set(i["ingredient_id"] for i in r.get("ingredients", []))
            if allergies & ing_ids:
                continue
            tag_hit = bool(want_tags & set(r.get("health_tags", [])))
            ing_hit = bool(favour & ing_ids)
            if not (tag_hit or ing_hit):
                continue
            score = (2 if tag_hit else 0) + (len(favour & ing_ids))
            picks.append((score, {
                "id": r["id"], "name": r.get("name_en"), "name_ta": r.get("name_ta"),
                "category": r.get("category"), "nutrition": r.get("nutrition", {}),
                "why": f.get("reason", ""),
            }))
        picks.sort(key=lambda x: -x[0])
        groups.append({
            "focus": f.get("label", g),
            "guidance": f.get("guidance", ""),
            "dishes": [p[1] for p in picks[:8]],
        })
    return {"groups": groups, "note": "Dishes that SUPPORT your focus — not medical treatment; consult your doctor."}


@api_router.get("/meals/approved")
async def approved_meals(current=Depends(get_current_user)):
    """Capt. Charmer's approved healthy meals to order out. Only dishes tagged
    healthy (high-protein / heart-healthy / light / diabetic-friendly) are
    offered — junk is simply never presented. Filtered by diet & focus."""
    profile = await db.profiles.find_one({"user_id": current["user_id"]}, {"_id": 0}) or {}
    goals = list((profile.get("health") or {}).get("goals") or []) or ["balanced"]
    diet = profile.get("diet") or "veg"
    allergies = set((profile.get("allergies") or []) + (profile.get("custom_avoid") or []))
    rules = _health_rules().get("focuses", {})
    recipes = await db.recipes.find({}, {"_id": 0}).to_list(500)

    DIET_OK = {"veg": {"veg"}, "egg": {"veg", "egg"}, "nonveg": {"veg", "egg", "nonveg"}}
    allowed = DIET_OK.get(diet, {"veg"})
    HEALTHY = {"high_protein", "heart_healthy", "light", "diabetic_friendly", "high_fiber"}

    # tags favoured by the user's focuses (for ranking)
    want = set()
    for g in goals:
        want |= set(rules.get(g, {}).get("recipe_tags", []))

    out = []
    for r in recipes:
        if r.get("diet") not in allowed:
            continue
        tags = set(r.get("health_tags", []))
        if not (tags & HEALTHY):
            continue  # Captain blocks anything not healthy-tagged
        ing_ids = set(i["ingredient_id"] for i in r.get("ingredients", []))
        if allergies & ing_ids:
            continue
        score = len(tags & want) * 2 + len(tags & HEALTHY)
        out.append((score, {
            "id": r["id"], "name": r.get("name_en"), "name_ta": r.get("name_ta"),
            "category": r.get("category"), "nutrition": r.get("nutrition", {}),
            "tags": sorted(tags & HEALTHY),
        }))
    out.sort(key=lambda x: -x[0])
    return {
        "meals": [m for _, m in out[:20]],
        "note": "Captain-approved healthy meals. Order these to keep your focus on track — consult your doctor for any condition.",
    }


class MealOrderIn(BaseModel):
    dish_id: str
    dish_name: str
    amount_inr: Optional[float] = None


@api_router.post("/meals/order-log")
async def meal_order_log(body: MealOrderIn, current=Depends(get_current_user)):
    """Record that the user ordered an approved meal out (dish auto-recorded;
    amount optional — logged to the food budget when provided)."""
    doc = {
        "user_id": current["user_id"],
        "dish_id": body.dish_id,
        "dish_name": body.dish_name,
        "amount_inr": body.amount_inr,
        "source": "zomato",
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    await db.meal_orders.insert_one(doc)
    return {"ok": True, "logged": body.dish_name}


@api_router.get("/grocery/suggest-health")
async def grocery_suggest_health(current=Depends(get_current_user)):
    """Capt. Charmer's health-driven buy list: profile focus areas -> favoured
    ingredients (ICMR-NIN grounded, IDs verified against the catalog) with a
    reason per item. Filtered by diet/allergies, priced, deduped."""
    profile = await db.profiles.find_one({"user_id": current["user_id"]}, {"_id": 0}) or {}
    goals = list((profile.get("health") or {}).get("goals") or [])
    rules = _health_rules()
    focuses = rules.get("focuses", {})
    if not goals:
        goals = ["balanced"]
    diet = profile.get("diet") or "veg"
    avoid = set((profile.get("allergies") or []) + (profile.get("custom_avoid") or []))

    NONVEG = {"eggs", "chicken", "fish"}
    ing_docs = {i["ingredient_id"]: i for i in await db.ingredients.find({}, {"_id": 0}).to_list(500)}

    picked: Dict[str, Dict[str, Any]] = {}
    guidance: List[str] = []
    for g in goals:
        f = focuses.get(g)
        if not f:
            continue
        if f.get("guidance"):
            guidance.append(f["guidance"])
        for iid in f.get("grocery_favour", []):
            if iid in picked or iid in avoid:
                continue
            if diet == "veg" and iid in NONVEG:
                continue
            if diet == "egg" and iid in {"chicken", "fish"}:
                continue
            ing = ing_docs.get(iid)
            if not ing:
                continue
            qty, unit = (250, "g")
            if iid in {"milk"}: qty, unit = (500, "ml")
            if iid in {"eggs"}: qty, unit = (6, "pc")
            if iid in {"lemon", "drumstick"}: qty, unit = (4, "pc")
            est = _price_for(iid, float(qty), unit)
            picked[iid] = {
                "ingredient_id": iid,
                "name": ing.get("name", iid.replace("_", " ").title()),
                "category": ing.get("category"),
                "qty": qty, "unit": unit,
                "reason": f.get("reason", ""),
                "focus": f.get("label", g),
                "estimated_inr": round(est, 2) if est else None,
            }
    items = list(picked.values())[:18]
    return {
        "items": items,
        "guidance": guidance[:3],
        "focuses": [focuses.get(g, {}).get("label", g) for g in goals if g in focuses],
        "note": "Guidance based on ICMR-NIN 2024 — not medical advice; consult your doctor.",
    }


class GroceryRemoveIn(BaseModel):
    ingredient_id: str


@api_router.post("/grocery/remove-item")
async def grocery_remove_item(payload: GroceryRemoveIn, current=Depends(get_current_user)):
    await db.grocery_overrides.update_one(
        {"user_id": current["user_id"]},
        {"$addToSet": {"removed": payload.ingredient_id},
         "$pull": {"manual": {"ingredient_id": payload.ingredient_id}}},
        upsert=True,
    )
    return {"ok": True}


@api_router.post("/grocery/restore-item")
async def grocery_restore_item(payload: GroceryRemoveIn, current=Depends(get_current_user)):
    await db.grocery_overrides.update_one(
        {"user_id": current["user_id"]},
        {"$pull": {"removed": payload.ingredient_id}},
        upsert=True,
    )
    return {"ok": True}


class GroceryAddIn(BaseModel):
    ingredient_id: str
    qty: float
    unit: str = "g"


@api_router.post("/grocery/add-item")
async def grocery_add_item(payload: GroceryAddIn, current=Depends(get_current_user)):
    ing = await db.ingredients.find_one({"ingredient_id": payload.ingredient_id}, {"_id": 0})
    if not ing:
        raise HTTPException(status_code=404, detail="Unknown ingredient")
    await db.grocery_overrides.update_one(
        {"user_id": current["user_id"]},
        {"$pull": {"manual": {"ingredient_id": payload.ingredient_id}}},
    )
    await db.grocery_overrides.update_one(
        {"user_id": current["user_id"]},
        {"$push": {"manual": payload.dict()},
         "$pull": {"removed": payload.ingredient_id}},
        upsert=True,
    )
    return {"ok": True}


@api_router.get("/grocery/search-ingredients")
async def grocery_search_ingredients(q: str = "", current=Depends(get_current_user)):
    ql = q.strip().lower()
    all_ing = await db.ingredients.find({}, {"_id": 0}).to_list(200)
    if ql:
        all_ing = [i for i in all_ing if ql in i["name"].lower() or ql in i["ingredient_id"]]
    return {"items": sorted(all_ing, key=lambda i: i["name"])[:30]}


class OrderPlacedIn(BaseModel):
    items: List[Dict[str, Any]]  # each {ingredient_id, qty, unit, storage?, paid_inr?}
    source: Optional[str] = "online"  # "online" | "local_shop"
    total_paid_inr: Optional[float] = None  # quick single-total entry (optional)


@api_router.post("/grocery/order-placed")
async def grocery_order_placed(payload: OrderPlacedIn, current=Depends(get_current_user)):
    today = _now().date().isoformat()
    # Purchase log: powers actual-spend vs estimate in weekly/monthly reports.
    purchase_rows = []
    for it in payload.items:
        iid = it.get("ingredient_id")
        if not iid:
            continue
        est = _price_for(iid, float(it.get("qty", 0) or 0), it.get("unit", "g"))
        paid = it.get("paid_inr")
        try:
            paid = round(float(paid), 2) if paid is not None else None
        except (TypeError, ValueError):
            paid = None
        purchase_rows.append({
            "id": uuid.uuid4().hex,
            "user_id": current["user_id"],
            "date": today,
            "ingredient_id": iid,
            "qty": it.get("qty"),
            "unit": it.get("unit"),
            "estimated_inr": round(est, 2) if est else None,
            "paid_inr": paid,
            "source": payload.source or "online",
            "created_at": _now(),
        })
    if purchase_rows:
        # Quick-total mode: user typed one total instead of per-item prices.
        # Distribute it across items proportionally to estimates (or evenly).
        item_paid_sum = sum((p["paid_inr"] or 0) for p in purchase_rows)
        if payload.total_paid_inr and item_paid_sum == 0:
            est_sum = sum((p["estimated_inr"] or 0) for p in purchase_rows)
            for p in purchase_rows:
                if est_sum > 0:
                    share = (p["estimated_inr"] or 0) / est_sum
                else:
                    share = 1 / len(purchase_rows)
                p["paid_inr"] = round(payload.total_paid_inr * share, 2)
                p["paid_is_derived"] = True
        await db.purchases.insert_many(purchase_rows)
    inserted = []
    ingredients = {
        i["ingredient_id"]: i
        for i in await db.ingredients.find({}, {"_id": 0}).to_list(1000)
    }
    for it in payload.items:
        iid = it.get("ingredient_id")
        if not iid or iid not in ingredients:
            continue
        # Merge with any existing pantry row for the same ingredient (base-unit sum)
        existing = await db.pantry_items.find_one(
            {"user_id": current["user_id"], "ingredient_id": iid}
        )
        default_storage = it.get("storage")
        if not default_storage:
            ing = ingredients[iid]
            # Heuristic: prefer pantry unless only fridge_days is defined
            if ing.get("pantry_days") and not ing.get("fridge_days"):
                default_storage = "pantry"
            elif ing.get("fridge_days") and not ing.get("pantry_days"):
                default_storage = "fridge"
            else:
                default_storage = "pantry"
        if existing:
            # Add qty in base units
            eq, eu = _to_base(float(existing.get("qty", 0)), existing.get("unit", "g"))
            nq, nu = _to_base(float(it.get("qty", 0)), it.get("unit", "g"))
            if eu == nu:
                total_qty, total_unit = _from_base(eq + nq, eu)
                await db.pantry_items.update_one(
                    {"id": existing["id"]},
                    {
                        "$set": {
                            "qty": total_qty,
                            "unit": total_unit,
                            "storage": default_storage,
                            "purchase_date": today,
                        }
                    },
                )
                inserted.append({"id": existing["id"], "merged": True})
                continue
        doc = {
            "id": uuid.uuid4().hex,
            "user_id": current["user_id"],
            "ingredient_id": iid,
            "qty": float(it.get("qty", 0)),
            "unit": it.get("unit", "g"),
            "storage": default_storage,
            "purchase_date": today,
            "created_at": _now(),
        }
        await db.pantry_items.insert_one(doc)
        doc.pop("_id", None)
        inserted.append({"id": doc["id"], "merged": False})
    return {"added": len(inserted), "items": inserted}


class CookedIn(BaseModel):
    meal: str  # breakfast | lunch | dinner
    recipe_id: str


@api_router.post("/plan/{date}/cooked")
async def plan_cooked(date: str, payload: CookedIn, current=Depends(get_current_user)):
    doc = await db.meal_plans.find_one(
        {"user_id": current["user_id"], "date": date}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Plan not found")
    meal = doc.get(payload.meal, {})
    item = next(
        (it for it in meal.get("items", []) if it.get("id") == payload.recipe_id),
        None,
    )
    if not item:
        raise HTTPException(status_code=404, detail="Dish not in meal")

    profile = await db.profiles.find_one({"user_id": current["user_id"]}, {"_id": 0}) or {}
    household = max(1, int(profile.get("household_size", 1)))

    deducted: List[Dict[str, Any]] = []
    for ing in item.get("ingredients", []) or []:
        iid = ing.get("ingredient_id")
        if not iid or iid in _GROCERY_STAPLES:
            continue
        need_base_qty, need_base_unit = _to_base(
            float(ing.get("qty", 0)) * household, ing.get("unit", "g")
        )
        # Reduce from pantry rows for this ingredient (all rows summed in base)
        rows = await db.pantry_items.find(
            {"user_id": current["user_id"], "ingredient_id": iid}, {"_id": 0}
        ).to_list(20)
        remaining = need_base_qty
        for row in rows:
            if remaining <= 0:
                break
            rq, ru = _to_base(float(row.get("qty", 0)), row.get("unit", "g"))
            if ru != need_base_unit:
                continue
            take = min(rq, remaining)
            new_base = rq - take
            if new_base <= 0.01:
                await db.pantry_items.delete_one({"id": row["id"]})
            else:
                new_qty, new_unit = _from_base(new_base, ru)
                await db.pantry_items.update_one(
                    {"id": row["id"]},
                    {"$set": {"qty": new_qty, "unit": new_unit}},
                )
            remaining -= take
        deducted.append(
            {
                "ingredient_id": iid,
                "requested_base": round(need_base_qty, 1),
                "unmet_base": round(max(0, remaining), 1),
                "base_unit": need_base_unit,
            }
        )

    # Mark dish as cooked in the plan doc
    for i, it in enumerate(meal.get("items", [])):
        if it.get("id") == payload.recipe_id:
            it["cooked"] = True
            it["cooked_at"] = _now().isoformat()
            meal["items"][i] = it
            break
    doc[payload.meal] = meal
    doc["updated_at"] = _now()
    await db.meal_plans.replace_one(
        {"user_id": current["user_id"], "date": date}, doc, upsert=True
    )

    # Streak update
    streak_doc = await db.user_streaks.find_one({"user_id": current["user_id"]}, {"_id": 0}) or {
        "user_id": current["user_id"],
        "current_streak": 0,
        "longest_streak": 0,
        "total_cooked": 0,
        "last_cooked_date": None,
    }
    today = _now().date().isoformat()
    last = streak_doc.get("last_cooked_date")
    if last == today:
        pass  # already counted today
    else:
        yesterday = (_now().date() - timedelta(days=1)).isoformat()
        if last == yesterday:
            streak_doc["current_streak"] = int(streak_doc.get("current_streak", 0)) + 1
        else:
            streak_doc["current_streak"] = 1
        streak_doc["last_cooked_date"] = today
    streak_doc["total_cooked"] = int(streak_doc.get("total_cooked", 0)) + 1
    streak_doc["longest_streak"] = max(
        int(streak_doc.get("longest_streak", 0)),
        int(streak_doc["current_streak"]),
    )
    await db.user_streaks.replace_one(
        {"user_id": current["user_id"]}, streak_doc, upsert=True
    )

    return {
        "deducted": deducted,
        "streak": {
            "current_streak": streak_doc["current_streak"],
            "longest_streak": streak_doc["longest_streak"],
            "total_cooked": streak_doc["total_cooked"],
        },
    }


@api_router.get("/streak")
async def get_streak(current=Depends(get_current_user)):
    doc = await db.user_streaks.find_one({"user_id": current["user_id"]}, {"_id": 0}) or {
        "user_id": current["user_id"],
        "current_streak": 0,
        "longest_streak": 0,
        "total_cooked": 0,
        "last_cooked_date": None,
    }
    return doc


# ------------------------- Settings + Premium + Report ------------------------- #
DEFAULT_NOTIF_PREFS = {
    "pantry_alert_enabled": True,
    "pantry_alert_time": "08:00",
    "meal_reminders_enabled": True,
    "breakfast_time": "08:00",
    "lunch_time": "12:30",
    "dinner_time": "20:00",
    "cook_check_enabled": True,
    "cook_check_time": "21:00",
    "weekly_report_enabled": True,
    "weekly_report_dow": 6,  # 0=Mon .. 6=Sun
    "weekly_report_time": "18:00",
}

FREE_LIMITS = {"pantry_max": 25, "plan_generations_per_month": 4}


@api_router.get("/settings/notifications")
async def notif_get(current=Depends(get_current_user)):
    doc = await db.notif_prefs.find_one({"user_id": current["user_id"]}, {"_id": 0})
    if not doc:
        doc = {"user_id": current["user_id"], **DEFAULT_NOTIF_PREFS}
        await db.notif_prefs.insert_one(dict(doc))
        doc.pop("_id", None)
    return doc


class NotifPrefsIn(BaseModel):
    pantry_alert_enabled: Optional[bool] = None
    pantry_alert_time: Optional[str] = None
    meal_reminders_enabled: Optional[bool] = None
    breakfast_time: Optional[str] = None
    lunch_time: Optional[str] = None
    dinner_time: Optional[str] = None
    cook_check_enabled: Optional[bool] = None
    cook_check_time: Optional[str] = None
    weekly_report_enabled: Optional[bool] = None
    weekly_report_dow: Optional[int] = None
    weekly_report_time: Optional[str] = None


@api_router.put("/settings/notifications")
async def notif_put(payload: NotifPrefsIn, current=Depends(get_current_user)):
    update = payload.model_dump(exclude_none=True)
    await db.notif_prefs.update_one(
        {"user_id": current["user_id"]},
        {"$set": update, "$setOnInsert": {"user_id": current["user_id"]}},
        upsert=True,
    )
    doc = await db.notif_prefs.find_one({"user_id": current["user_id"]}, {"_id": 0})
    return doc


@api_router.get("/premium/status")
async def premium_status(current=Depends(get_current_user)):
    doc = await db.premium.find_one({"user_id": current["user_id"]}, {"_id": 0}) or {
        "user_id": current["user_id"],
        "is_premium": False,
        "plan": None,
        "started_at": None,
        "expires_at": None,
    }
    # quotas
    n_pantry = await db.pantry_items.count_documents({"user_id": current["user_id"]})
    # plan generations this calendar month
    now = _now()
    start_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    n_plans_this_month = await db.plan_gen_log.count_documents(
        {"user_id": current["user_id"], "at": {"$gte": start_month}}
    )
    return {
        **doc,
        "quota": {
            "pantry_used": n_pantry,
            "pantry_max": None if doc.get("is_premium") else FREE_LIMITS["pantry_max"],
            "plan_generations_used": n_plans_this_month,
            "plan_generations_max": None
            if doc.get("is_premium")
            else FREE_LIMITS["plan_generations_per_month"],
        },
        "free_limits": FREE_LIMITS,
    }


class PurchaseIn(BaseModel):
    plan: str  # "monthly" | "yearly"
    receipt: Optional[str] = None  # MOCKED: real IAP receipt goes here


@api_router.post("/premium/purchase")
async def premium_purchase(payload: PurchaseIn, current=Depends(get_current_user)):
    """MOCKED purchase — real Google Play Billing wired at build time."""
    if payload.plan not in ("monthly", "yearly"):
        raise HTTPException(status_code=400, detail="Invalid plan")
    now = _now()
    expires = now + timedelta(days=30 if payload.plan == "monthly" else 365)
    doc = {
        "user_id": current["user_id"],
        "is_premium": True,
        "plan": payload.plan,
        "started_at": now,
        "expires_at": expires,
        "mocked": True,
    }
    await db.premium.replace_one({"user_id": current["user_id"]}, doc, upsert=True)
    return _clean(await db.premium.find_one({"user_id": current["user_id"]}))


@api_router.post("/premium/cancel")
async def premium_cancel(current=Depends(get_current_user)):
    await db.premium.update_one(
        {"user_id": current["user_id"]}, {"$set": {"is_premium": False, "cancelled_at": _now()}}
    )
    return {"ok": True}


@api_router.delete("/account")
async def account_delete(current=Depends(get_current_user)):
    """Hard-delete every document owned by this user + invalidate sessions."""
    uid = current["user_id"]
    email = current.get("email")
    phone = current.get("phone")
    for coll in (
        "users",
        "user_sessions",
        "profiles",
        "pantry_items",
        "waste_log",
        "meal_plans",
        "notif_prefs",
        "premium",
        "user_streaks",
        "plan_gen_log",
        "ai_weekly_plans",
        "habit_log",
    ):
        await db[coll].delete_many({"user_id": uid})
    # users doc keyed by user_id
    await db.users.delete_many({"user_id": uid})
    if email:
        await db.users.delete_many({"email": email})
    if phone:
        await db.users.delete_many({"phone": phone})
    return {"deleted": True, "user_id": uid}


@api_router.get("/report/weekly")
async def weekly_report(
    end_date: Optional[str] = None,
    current=Depends(get_current_user),
):
    """Weekly summary — money saved, waste, diet balance, badges."""
    from datetime import date as _dt_date

    end = _dt_date.fromisoformat(end_date) if end_date else _now().date()
    start = end - timedelta(days=6)

    # Waste log for the week
    waste = await db.waste_log.find(
        {
            "user_id": current["user_id"],
            "discarded_at": {
                "$gte": datetime.combine(start, datetime.min.time()).replace(tzinfo=timezone.utc),
                "$lte": datetime.combine(end, datetime.max.time()).replace(tzinfo=timezone.utc),
            },
        },
        {"_id": 0},
    ).to_list(500)
    waste_count = len(waste)
    waste_inr = round(sum((w.get("estimated_inr") or 0) for w in waste), 2)

    # Consumed value: sum of ₹ estimates for dishes cooked in the range
    plans_in = await db.meal_plans.find(
        {
            "user_id": current["user_id"],
            "date": {"$gte": start.isoformat(), "$lte": end.isoformat()},
        },
        {"_id": 0},
    ).to_list(30)
    consumed_inr = 0.0
    cooked_count = 0
    balanced_meal_count = 0
    total_meal_count = 0
    for p in plans_in:
        for mk in ("breakfast", "lunch", "dinner"):
            meal = p.get(mk, {})
            total_meal_count += 1
            if meal.get("chip") == "balanced":
                balanced_meal_count += 1
            for it in meal.get("items", []):
                if it.get("cooked"):
                    cooked_count += 1
                    # estimate ₹ from ingredient prices
                    for ing in it.get("ingredients", []) or []:
                        p_est = _price_for(
                            ing.get("ingredient_id", ""),
                            float(ing.get("qty", 0)) / 1000.0
                            if ing.get("unit") == "g"
                            else float(ing.get("qty", 0)),
                            "kg" if ing.get("unit") == "g" else ing.get("unit", "kg"),
                        )
                        if p_est:
                            consumed_inr += p_est

    consumed_inr = round(consumed_inr, 2)
    money_saved = max(0.0, round(consumed_inr - waste_inr, 2))

    # Diet balance score 0-100
    if total_meal_count == 0:
        balance_score = 0
    else:
        balance_score = int(round(100 * balanced_meal_count / total_meal_count))

    # Streak
    streak = await db.user_streaks.find_one({"user_id": current["user_id"]}, {"_id": 0}) or {
        "current_streak": 0, "longest_streak": 0, "total_cooked": 0,
    }

    # Badges
    badges: List[Dict[str, Any]] = []
    if waste_count == 0 and cooked_count > 0:
        badges.append({"key": "zero_waste_week", "label": "Zero-waste week", "icon": "leaf"})
    if streak.get("current_streak", 0) >= 7:
        badges.append({"key": "seven_day_streak", "label": "7-day streak", "icon": "flame"})
    if balance_score >= 80:
        badges.append({"key": "balanced_chef", "label": "Balanced chef", "icon": "medal"})
    if cooked_count >= 15:
        badges.append({"key": "home_cook_hero", "label": "Home cook hero", "icon": "restaurant"})

    return {
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "waste_count": waste_count,
        "waste_inr": waste_inr,
        "consumed_inr": consumed_inr,
        "money_saved_inr": money_saved,
        "cooked_count": cooked_count,
        "diet_balance_score": balance_score,
        "balanced_meals": balanced_meal_count,
        "total_meals": total_meal_count,
        "current_streak": streak.get("current_streak", 0),
        "longest_streak": streak.get("longest_streak", 0),
        "badges": badges,
        **(await _spend_and_lessons(current["user_id"], start.isoformat(), end.isoformat(),
                                    waste, waste_inr, consumed_inr)),
    }


async def _spend_and_lessons(
    user_id: str, start_iso: str, end_iso: str,
    waste: List[Dict[str, Any]], waste_inr: float, consumed_inr: float,
) -> Dict[str, Any]:
    """Shared report extras: actual vs estimated spend, utilisation, lessons."""
    purchases = await db.purchases.find(
        {"user_id": user_id, "date": {"$gte": start_iso, "$lte": end_iso}},
        {"_id": 0},
    ).to_list(1000)
    actual_spend = round(sum((p.get("paid_inr") or 0) for p in purchases), 2)
    estimated_spend = round(sum((p.get("estimated_inr") or 0) for p in purchases), 2)
    local_count = sum(1 for p in purchases if p.get("source") == "local_shop")

    # Utilisation: of the value that left the kitchen, how much was eaten vs binned
    used_plus_wasted = consumed_inr + waste_inr
    utilisation_pct = int(round(100 * consumed_inr / used_plus_wasted)) if used_plus_wasted > 0 else None

    # Top wasted ingredients (by ₹) — the raw material for lessons
    waste_by_ing: Dict[str, float] = {}
    for w in waste:
        nm = w.get("name") or w.get("ingredient_id") or "item"
        waste_by_ing[nm] = waste_by_ing.get(nm, 0) + (w.get("estimated_inr") or 0)
    top_wasted = sorted(
        ({"name": k, "inr": round(v, 2)} for k, v in waste_by_ing.items()),
        key=lambda x: -x["inr"],
    )[:3]

    # Lessons learnt — plain, actionable sentences
    lessons: List[str] = []
    if top_wasted and top_wasted[0]["inr"] > 0:
        lessons.append(
            f"{top_wasted[0]['name']} was your biggest waste (₹{top_wasted[0]['inr']:.0f}). "
            f"Buy a smaller quantity, or plan a dish that uses it within 2 days of purchase."
        )
    if actual_spend and estimated_spend:
        diff = round(actual_spend - estimated_spend, 2)
        if diff > 10:
            lessons.append(
                f"You paid ₹{diff:.0f} above AmmiAI's estimate. Compare local-shop and app prices "
                f"before buying — estimates are on each grocery item."
            )
        elif diff < -10:
            lessons.append(f"Smart shopping — you paid ₹{-diff:.0f} under estimate. Keep it up.")
    if utilisation_pct is not None:
        if utilisation_pct >= 90:
            lessons.append(f"{utilisation_pct}% of your food value was eaten, not wasted. Excellent kitchen discipline.")
        elif utilisation_pct < 70:
            lessons.append(
                f"Only {utilisation_pct}% of food value was used. Check 'Expiring soon' daily and cook those first."
            )
    if not lessons:
        lessons.append("Clean week — nothing to correct. Carry on, soldier.")

    return {
        "actual_spend_inr": actual_spend or None,
        "estimated_spend_inr": estimated_spend or None,
        "local_shop_purchases": local_count,
        "utilisation_pct": utilisation_pct,
        "top_wasted": top_wasted,
        "lessons": lessons,
    }


@api_router.get("/report/monthly")
async def monthly_report(
    year: Optional[int] = None,
    month: Optional[int] = None,
    current=Depends(get_current_user),
):
    """Monthly summary — spend, waste, utilisation, top dishes, lessons learnt."""
    now = _now()
    y = year or now.year
    m = month or now.month
    from calendar import monthrange
    last_day = monthrange(y, m)[1]
    start_iso = f"{y:04d}-{m:02d}-01"
    end_iso = f"{y:04d}-{m:02d}-{last_day:02d}"

    waste = await db.waste_log.find(
        {
            "user_id": current["user_id"],
            "discarded_at": {
                "$gte": datetime(y, m, 1, tzinfo=timezone.utc),
                "$lte": datetime(y, m, last_day, 23, 59, 59, tzinfo=timezone.utc),
            },
        },
        {"_id": 0},
    ).to_list(2000)
    waste_inr = round(sum((w.get("estimated_inr") or 0) for w in waste), 2)

    plans = await db.meal_plans.find(
        {"user_id": current["user_id"], "date": {"$gte": start_iso, "$lte": end_iso}},
        {"_id": 0},
    ).to_list(40)
    consumed_inr = 0.0
    cooked_count = 0
    dish_counter: Dict[str, int] = {}
    balanced_days = 0
    for p in plans:
        day_balanced = True
        for mk in ("breakfast", "lunch", "dinner"):
            meal = p.get(mk) or {}
            if meal.get("chip") != "balanced":
                day_balanced = False
            for it in meal.get("items", []):
                if it.get("cooked") and not it.get("static"):
                    cooked_count += 1
                    dish_counter[it.get("name_en", "dish")] = dish_counter.get(it.get("name_en", "dish"), 0) + 1
                    est = _dish_cost_estimate(it)
                    if est:
                        consumed_inr += est
        if day_balanced and any((p.get(mk) or {}).get("items") for mk in ("breakfast", "lunch", "dinner")):
            balanced_days += 1
    consumed_inr = round(consumed_inr, 2)
    top_dishes = sorted(
        ({"name": k, "count": v} for k, v in dish_counter.items()), key=lambda x: -x["count"]
    )[:5]

    extras = await _spend_and_lessons(
        current["user_id"], start_iso, end_iso, waste, waste_inr, consumed_inr
    )
    return {
        "year": y,
        "month": m,
        "start_date": start_iso,
        "end_date": end_iso,
        "days_planned": len(plans),
        "balanced_days": balanced_days,
        "cooked_count": cooked_count,
        "waste_count": len(waste),
        "waste_inr": waste_inr,
        "consumed_inr": consumed_inr,
        "top_dishes": top_dishes,
        **extras,
    }


class CaptainChatIn(BaseModel):
    message: str
    history: List[Dict[str, str]] = []  # [{role: "user"|"assistant", content}]


@api_router.post("/captain/chat")
async def captain_chat(payload: CaptainChatIn, current=Depends(get_current_user)):
    """Capt. Charmer's live brain: Claude with the user's real kitchen context —
    today's plan, pantry with expiries, profile. Not hardcoded lines."""
    key = (os.environ.get("ANTHROPIC_API_KEY") or "").strip()
    if not key:
        raise HTTPException(status_code=503, detail="AI not configured")
    msg = (payload.message or "").strip()[:600]
    if not msg:
        raise HTTPException(status_code=400, detail="Empty message")

    uid = current["user_id"]
    today = _now().date().isoformat()
    profile = await db.profiles.find_one({"user_id": uid}, {"_id": 0}) or {}
    plan = await db.meal_plans.find_one({"user_id": uid, "date": today}, {"_id": 0})
    pantry = await db.pantry_items.find({"user_id": uid}, {"_id": 0}).to_list(200)
    pantry_brief = []
    for p in pantry[:40]:
        e = await _enrich_item(p)
        pantry_brief.append({
            "name": e.get("name") or p.get("ingredient_id"),
            "qty": p.get("qty"), "unit": p.get("unit"),
            "days_left": e.get("days_left"),
        })
    plan_brief = None
    if plan:
        plan_brief = {
            mk: {
                "dishes": [i.get("name_en") for i in (plan.get(mk) or {}).get("items", []) if not i.get("static")],
                "kcal": (plan.get(mk) or {}).get("kcal"),
                "protein_g": (plan.get(mk) or {}).get("protein_g"),
                "status": (plan.get(mk) or {}).get("chip"),
            } for mk in ("breakfast", "lunch", "dinner")
        }

    from anthropic import AsyncAnthropic
    from ai_planner import AI_MODEL
    client = AsyncAnthropic(api_key=key)

    system = (
        "You are Capt. Charmer — a gruff, warm-hearted drill-sergeant panda running a Tamil family "
        "kitchen inside the AmmiAI app. Speak briefly (under 90 words), practically, in simple English "
        "with occasional Tamil food words. Use the KITCHEN CONTEXT to give real, specific answers about "
        "today's meals, pantry, expiring items, nutrition, and Tamil cooking. If asked about nutrition "
        "numbers, be honest that values are per-serving estimates from standard recipes. Never invent "
        "pantry items or dishes not in context. End actionable answers with a short order like "
        "'Carry on, soldier.'\n\n"
        f"KITCHEN CONTEXT:\nprofile: {json.dumps({k: profile.get(k) for k in ('name','diet','household_size','spice_level') if k in profile})}\n"
        f"health_focuses: {json.dumps([_health_rules().get('focuses', {}).get(g, {}).get('label', g) for g in (profile.get('health') or {}).get('goals', [])])}\n"
        f"focus_guidance: {json.dumps([_health_rules().get('focuses', {}).get(g, {}).get('guidance') for g in (profile.get('health') or {}).get('goals', []) if _health_rules().get('focuses', {}).get(g)])}\n"
        f"today_plan: {json.dumps(plan_brief)}\n"
        f"pantry: {json.dumps(pantry_brief)}"
    )
    msgs = [
        {"role": h.get("role", "user"), "content": (h.get("content") or "")[:500]}
        for h in payload.history[-8:]
        if h.get("role") in ("user", "assistant") and h.get("content")
    ]
    msgs.append({"role": "user", "content": msg})

    resp = await client.messages.create(
        model=AI_MODEL, max_tokens=300, system=system, messages=msgs,
    )
    reply = "".join(getattr(b, "text", "") or "" for b in (resp.content or [])).strip()
    return {"reply": reply}


class CustomDishIn(BaseModel):
    name_en: str
    name_ta: Optional[str] = None
    category: str = "accompaniment"
    diet: str = "veg"  # veg | egg | nonveg
    kcal: float
    protein_g: float
    fiber_g: float = 0
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None


@api_router.post("/recipes/custom")
async def create_custom_dish(payload: CustomDishIn, current=Depends(get_current_user)):
    """User's own dish — appears in their catalog, planner, and calendar like
    any built-in recipe. Nutrition values are the user's own per-serving numbers."""
    name = payload.name_en.strip()[:80]
    if not name:
        raise HTTPException(status_code=400, detail="Dish name required")
    if payload.category not in ("tiffin", "kuzhambu", "poriyal", "kootu", "rasam", "accompaniment", "variety_rice", "nonveg"):
        raise HTTPException(status_code=400, detail="Unknown category")
    if payload.diet not in ("veg", "egg", "nonveg"):
        raise HTTPException(status_code=400, detail="Unknown diet")
    doc = {
        "id": f"custom_{uuid.uuid4().hex[:10]}",
        "user_id": current["user_id"],  # personal — only this user sees it
        "custom": True,
        "name_en": name,
        "name_ta": (payload.name_ta or "").strip()[:80] or name,
        "category": payload.category,
        "diet": payload.diet,
        "spice_level": "medium",
        "prep_time_min": 20,
        "ingredients": [],
        "staple_spices": [],
        "nutrition": {
            "kcal": round(float(payload.kcal), 1),
            "protein_g": round(float(payload.protein_g), 1),
            "fiber_g": round(float(payload.fiber_g or 0), 1),
            "carbs_g": round(float(payload.carbs_g), 1) if payload.carbs_g is not None else None,
            "fat_g": round(float(payload.fat_g), 1) if payload.fat_g is not None else None,
        },
        "health_tags": ["custom"],
        "combo_partners": [],
        "notes": "Added by you — nutrition values are your own estimates.",
    }
    await db.recipes.insert_one({**doc})
    return doc


def _dish_cost_estimate(it: Dict[str, Any]) -> Optional[float]:
    total = 0.0
    for ing in it.get("ingredients", []) or []:
        p = _price_for(ing.get("ingredient_id", ""), float(ing.get("qty", 0) or 0), ing.get("unit", "g"))
        if p:
            total += p
    return round(total, 2) if total > 0 else None


class ScanBillIn(BaseModel):
    image_base64: str
    media_type: str = "image/jpeg"
    list_items: List[Dict[str, Any]] = []  # current grocery list [{ingredient_id, name}]


@api_router.post("/grocery/scan-bill")
async def grocery_scan_bill(payload: ScanBillIn, current=Depends(get_current_user)):
    """Read a shop bill photo with Claude vision; match lines to the user's
    grocery list so prices auto-fill instead of manual typing."""
    key = (os.environ.get("ANTHROPIC_API_KEY") or "").strip()
    if not key:
        raise HTTPException(status_code=503, detail="AI not configured")
    from anthropic import AsyncAnthropic
    from ai_planner import AI_MODEL

    client = AsyncAnthropic(api_key=key)
    resp = await client.messages.create(
        model=AI_MODEL,
        max_tokens=1200,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {
                    "type": "base64",
                    "media_type": payload.media_type,
                    "data": payload.image_base64,
                }},
                {"type": "text", "text": (
                    "This is a grocery bill, receipt, or an online order summary screenshot (Blinkit/Zepto/Instamart etc.), Tamil or English, possibly handwritten. "
                    "Extract every line item with its price in INR. Respond ONLY with JSON, no prose, "
                    "no markdown fences: {\"items\": [{\"name\": str, \"price_inr\": number}], "
                    "\"total_inr\": number or null}"
                )},
            ],
        }],
    )
    raw = "".join(getattr(b, "text", "") or "" for b in (resp.content or []))
    raw = raw.replace("```json", "").replace("```", "").strip()
    try:
        parsed = json.loads(raw)
    except Exception:
        raise HTTPException(status_code=422, detail="Couldn't read the bill — try a clearer photo")

    bill_items = parsed.get("items") or []
    # Fuzzy-match bill lines to the user's current list (sent by the app,
    # since the grocery list is computed, not stored) + known ingredients.
    glist = payload.list_items
    ingredients = await db.ingredients.find({}, {"_id": 0, "id": 1, "name_en": 1}).to_list(1000)
    ing_names = {i["id"]: (i.get("name_en") or "").lower() for i in ingredients}

    # Token-based matcher: real store names ("WOW! Coco Fresh Grated Coconut",
    # "Sambar Onion Peeled (Chinna Vengayam)", "Lady Finger (Vendikaai)")
    # must land on catalog ingredients. Score = overlap of significant tokens
    # across BOTH English and Tamil-transliteration parts of our names.
    STOP = {"fresh", "organic", "local", "pack", "unit", "peeled", "cleaned",
            "without", "roots", "premium", "select", "wow", "the", "and", "with"}
    SYNONYM = {
        "lady": "ladies", "coco": "coconut", "brinjal": "brinjal",
        "capsicum": "capsicum", "dhania": "coriander", "pudina": "mint",
    }

    def _tokens(s: str) -> set:
        import re as _re
        toks = set()
        for t in _re.split(r"[^a-z]+", s.lower()):
            if len(t) < 3 or t in STOP:
                continue
            toks.add(SYNONYM.get(t, t))
        return toks

    # Build searchable token sets: list items first (higher priority), then catalog
    list_tok = [(g.get("ingredient_id"), _tokens(str(g.get("name") or ing_names.get(g.get("ingredient_id", ""), "")))) for g in glist]
    cat_tok = [(iid, _tokens(nm)) for iid, nm in ing_names.items()]

    def _match(bill_name: str) -> Optional[str]:
        bt = _tokens(bill_name)
        if not bt:
            return None
        best_id, best_score = None, 0
        for iid, toks in list_tok:
            sc = len(bt & toks) * 2  # list items win ties
            if sc > best_score:
                best_id, best_score = iid, sc
        for iid, toks in cat_tok:
            sc = len(bt & toks)
            if sc > best_score:
                best_id, best_score = iid, sc
        return best_id if best_score >= 1 else None

    matches: Dict[str, float] = {}
    unmatched: List[Dict[str, Any]] = []
    for bi in bill_items:
        try:
            price = round(float(bi.get("price_inr")), 2)
        except (TypeError, ValueError):
            continue
        iid = _match(str(bi.get("name", "")))
        if iid:
            matches[iid] = matches.get(iid, 0) + price
        else:
            unmatched.append({"name": bi.get("name"), "price_inr": price})
    total = parsed.get("total_inr")
    try:
        total = round(float(total), 2) if total is not None else None
    except (TypeError, ValueError):
        total = None
    return {"matches": matches, "unmatched": unmatched, "total_inr": total}


@api_router.get("/report/monthly-advice")
async def monthly_advice(
    year: Optional[int] = None,
    month: Optional[int] = None,
    current=Depends(get_current_user),
):
    """Captain's AI habit analysis: buying patterns → next-month discipline plan."""
    key = (os.environ.get("ANTHROPIC_API_KEY") or "").strip()
    if not key:
        raise HTTPException(status_code=503, detail="AI not configured")
    report = await monthly_report(year=year, month=month, current=current)
    purchases = await db.purchases.find(
        {"user_id": current["user_id"],
         "date": {"$gte": report["start_date"], "$lte": report["end_date"]}},
        {"_id": 0, "ingredient_id": 1, "paid_inr": 1, "estimated_inr": 1, "source": 1, "date": 1},
    ).to_list(1000)

    from anthropic import AsyncAnthropic
    from ai_planner import AI_MODEL
    client = AsyncAnthropic(api_key=key)
    prompt = (
        "You are Capt. Charmer, a gruff-but-caring drill-sergeant panda who manages a Tamil family kitchen. "
        "Analyse this month's buying and cooking habits, then give next month's discipline plan. "
        "Be specific with numbers from the data. Format: 2-3 short observations about patterns "
        "(overbuying, waste timing, price vs estimate, shop vs app), then exactly 3 numbered orders "
        "for next month. Max 130 words total. End with 'Carry on, soldier.'\n\n"
        f"MONTH SUMMARY: {json.dumps({k: v for k, v in report.items() if k != 'lessons'})}\n"
        f"PURCHASES: {json.dumps(purchases[:120])}"
    )
    resp = await client.messages.create(
        model=AI_MODEL, max_tokens=400,
        messages=[{"role": "user", "content": prompt}],
    )
    advice = "".join(getattr(b, "text", "") or "" for b in (resp.content or [])).strip()
    return {"advice": advice, "year": report["year"], "month": report["month"]}


# ------------------------- AI Layer ------------------------- #
# Live Anthropic (BYO key) integration. Reads ANTHROPIC_API_KEY at call time.
import ai_planner  # noqa: E402


def _ai_key() -> str:
    return (os.environ.get("ANTHROPIC_API_KEY") or "").strip()


@api_router.get("/ai/status")
async def ai_status(current=Depends(get_current_user)):
    """Reports whether the AI layer is configured."""
    uid = current["user_id"]
    cache = await db.ai_weekly_plans.find_one({"user_id": uid}, {"_id": 0})
    return {
        "configured": bool(_ai_key()),
        "model": ai_planner.AI_MODEL,
        "capabilities": ["weekly_personalization"],
        "week_cached": bool(cache),
        "week_start": (cache or {}).get("week_start"),
    }


async def _build_week_candidates(user_id: str) -> Dict[str, List[Dict[str, Any]]]:
    """3 candidate day-plans per day for a 7-day window starting today."""
    today = _now().date()
    seeds = [1001, 2002, 3003]
    out: Dict[str, List[Dict[str, Any]]] = {}
    for i in range(7):
        d = (today + timedelta(days=i)).isoformat()
        cands = []
        for s in seeds:
            ctx = await _build_context(user_id, seed=s + i)
            plan = _sanitize_plan(engine_plan_day(ctx))
            plan["date"] = d
            cands.append(plan)
        out[d] = cands
    return out


async def _apply_ai_selection_to_plans(
    user_id: str,
    candidates: Dict[str, List[Dict[str, Any]]],
    picks: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Persist chosen candidate as this user's meal_plan for each date and
    stamp ai_reason on every doc. Returns the updated 7-day plan list."""
    result: List[Dict[str, Any]] = []
    for pick in picks:
        d = pick["date"]
        ci = int(pick.get("candidate_index", 0))
        plan = dict(candidates[d][ci])
        plan["user_id"] = user_id
        plan["date"] = d
        plan["updated_at"] = _now()
        plan["ai_reason"] = pick.get("reason")
        plan["ai_source"] = pick.get("ai_source", "ai")
        await db.meal_plans.replace_one(
            {"user_id": user_id, "date": d}, plan, upsert=True
        )
        fresh = await db.meal_plans.find_one(
            {"user_id": user_id, "date": d}, {"_id": 0}
        )
        result.append(fresh)
    return result


@api_router.post("/ai/plan/week")
async def ai_plan_week(current=Depends(get_current_user)):
    """One AI call generates the whole week; result is cached. Swaps and
    manual regenerates within the week hit the local engine only.
    Silent fallback to rule-based when Anthropic is unreachable/invalid."""
    uid = current["user_id"]

    # profile + pantry
    profile = await db.profiles.find_one({"user_id": uid}, {"_id": 0}) or {}
    pantry_raw = await db.pantry_items.find(
        {"user_id": uid}, {"_id": 0}
    ).to_list(1000)
    pantry_items = [await _enrich_item(dict(it)) for it in pantry_raw]

    # 3 candidates per day
    candidates = await _build_week_candidates(uid)

    picks, meta = await ai_planner.personalize_week(
        profile=profile, pantry_items=pantry_items, candidates_by_date=candidates
    )
    for p in picks:
        p["ai_source"] = meta.get("source", "ai")

    days = await _apply_ai_selection_to_plans(uid, candidates, picks)
    week_start = min(candidates.keys())
    cache_doc = {
        "user_id": uid,
        "week_start": week_start,
        "meta": meta,
        "picks": picks,
        "generated_at": _now(),
    }
    await db.ai_weekly_plans.replace_one(
        {"user_id": uid, "week_start": week_start}, cache_doc, upsert=True
    )
    return {
        "week_start": week_start,
        "days": days,
        "meta": meta,
    }


@api_router.get("/ai/plan/week")
async def ai_plan_week_get(current=Depends(get_current_user)):
    """Return the cached AI weekly plan (or {days: [], cached: false})."""
    uid = current["user_id"]
    cache = await db.ai_weekly_plans.find_one({"user_id": uid}, {"_id": 0})
    if not cache:
        return {"cached": False, "days": []}
    # rebuild days from meal_plans (they carry ai_reason)
    days: List[Dict[str, Any]] = []
    for p in cache.get("picks", []):
        d = p.get("date")
        doc = await db.meal_plans.find_one({"user_id": uid, "date": d}, {"_id": 0})
        if doc:
            days.append(doc)
    return {
        "cached": True,
        "week_start": cache.get("week_start"),
        "generated_at": cache.get("generated_at"),
        "meta": cache.get("meta"),
        "days": days,
    }


@api_router.delete("/ai/plan/week")
async def ai_plan_week_clear(current=Depends(get_current_user)):
    """Clear the cached AI weekly plan (does not touch meal_plans)."""
    uid = current["user_id"]
    await db.ai_weekly_plans.delete_many({"user_id": uid})
    return {"cleared": True}


# ------------------------- Habits & Insights ------------------------- #
# Manual habit / activity check-in (no phone sensors — owner's explicit design).
# METs are standard reference values; kcal is an ESTIMATE only.
HABIT_METS = {
    "walk": 3.5, "post_meal_walk": 3.0, "jog": 7.0, "cycle": 6.8,
    "gym": 5.0, "swim": 7.0, "yoga": 2.5, "stretch": 2.0, "water": 0.0,
}
# Exercise habits ask for a duration; the rest are instant toggles.
HABIT_DURATION = {"walk", "post_meal_walk", "jog", "cycle", "gym", "swim", "yoga", "stretch"}
HABIT_LABELS = {
    "walk": "Walk", "post_meal_walk": "Post-meal walk", "jog": "Jog",
    "cycle": "Cycle", "gym": "Gym", "swim": "Swim", "yoga": "Yoga",
    "stretch": "Stretch", "water": "Water 8x",
}
HABIT_ICONS = {
    "walk": "walk", "post_meal_walk": "footsteps", "jog": "fitness",
    "cycle": "bicycle", "gym": "barbell", "swim": "water",
    "yoga": "body", "stretch": "accessibility", "water": "water-outline",
}
# Focus → suggested habit order (master brief B2). Union across focuses, deduped.
FOCUS_HABITS = {
    "weight_loss": ["jog", "gym", "cycle", "walk", "water"],
    "diabetic_friendly": ["post_meal_walk", "walk", "yoga", "water"],
    "bp_friendly": ["walk", "yoga", "swim", "water"],
    "high_protein": ["gym", "jog", "water", "stretch"],
    "iron_support": ["walk", "yoga", "water", "stretch"],
    "bone_calcium": ["walk", "yoga", "water", "stretch"],
    "digestion_fiber": ["walk", "yoga", "water", "stretch"],
    "balanced": ["walk", "yoga", "water", "stretch"],
}
DEFAULT_HABIT_ORDER = [
    "walk", "post_meal_walk", "jog", "cycle", "gym", "swim", "yoga", "stretch", "water",
]
DEFAULT_WEIGHT_KG = 60.0
SAFE_PACE_KG_WEEK = 0.5  # never present an aggressive-deficit projection (CLAUDE.md rule 5)


def _habit_order_for(goals: List[str]) -> List[str]:
    order: List[str] = []
    for g in goals or []:
        for h in FOCUS_HABITS.get(g, []):
            if h not in order:
                order.append(h)
    for h in DEFAULT_HABIT_ORDER:
        if h not in order:
            order.append(h)
    return order


def _habit_kcal(habit: str, minutes: Optional[int], weight_kg: Optional[float]) -> int:
    met = HABIT_METS.get(habit, 0.0)
    if not met or not minutes:
        return 0
    w = weight_kg or DEFAULT_WEIGHT_KG
    return int(round(met * w * (minutes / 60.0)))


def _streak_from_dates(days: set, today) -> int:
    """Consecutive days ending today (if logged) or yesterday (still-alive streak)."""
    if not days:
        return 0
    cur = today if today.isoformat() in days else today - timedelta(days=1)
    streak = 0
    while cur.isoformat() in days:
        streak += 1
        cur = cur - timedelta(days=1)
    return streak


class HabitLogIn(BaseModel):
    habit: str
    minutes: Optional[int] = None


@api_router.get("/habits/today")
async def habits_today(current=Depends(get_current_user)):
    uid = current["user_id"]
    today = _now().date()
    date = today.isoformat()
    profile = await db.profiles.find_one({"user_id": uid}, {"_id": 0}) or {}
    health = profile.get("health") or {}
    goals = list(health.get("goals") or [])
    order = _habit_order_for(goals)

    since = (today - timedelta(days=90)).isoformat()
    recent = await db.habit_log.find(
        {"user_id": uid, "date": {"$gte": since}}, {"_id": 0}
    ).to_list(2000)
    by_habit: Dict[str, set] = {}
    today_logs: Dict[str, Dict[str, Any]] = {}
    for r in recent:
        by_habit.setdefault(r["habit"], set()).add(r["date"])
        if r["date"] == date:
            today_logs[r["habit"]] = r

    habits = []
    total_kcal = 0
    streaks: Dict[str, int] = {}
    for h in order:
        log = today_logs.get(h)
        done = log is not None
        streak = _streak_from_dates(by_habit.get(h, set()), today)
        streaks[h] = streak
        kcal = int(log.get("kcal_est") or 0) if log else 0
        total_kcal += kcal
        habits.append({
            "habit": h,
            "label": HABIT_LABELS.get(h, h.title()),
            "icon": HABIT_ICONS.get(h, "ellipse"),
            "needs_duration": h in HABIT_DURATION,
            "done": done,
            "minutes": log.get("minutes") if log else None,
            "kcal_est": kcal,
            "streak": streak,
        })
    return {
        "habits": habits,
        "total_kcal": total_kcal,
        "streaks": streaks,
        "weight_kg": health.get("weight_kg"),
        "weight_missing": health.get("weight_kg") is None,
        "note": "Estimates for general wellness — not medical advice.",
    }


@api_router.post("/habits/log")
async def habits_log(payload: HabitLogIn, current=Depends(get_current_user)):
    uid = current["user_id"]
    habit = (payload.habit or "").strip()
    if habit not in HABIT_METS:
        raise HTTPException(status_code=400, detail="Unknown habit")
    today = _now().date()
    date = today.isoformat()
    profile = await db.profiles.find_one({"user_id": uid}, {"_id": 0}) or {}
    weight = (profile.get("health") or {}).get("weight_kg")
    minutes = payload.minutes if (payload.minutes and payload.minutes > 0) else None
    if habit in HABIT_DURATION and not minutes:
        minutes = 30  # sensible default if the picker was skipped
    kcal = _habit_kcal(habit, minutes or 0, weight)
    doc = {
        "user_id": uid, "habit": habit, "date": date,
        "minutes": minutes, "kcal_est": kcal, "ts": _now(),
    }
    await db.habit_log.update_one(
        {"user_id": uid, "habit": habit, "date": date}, {"$set": doc}, upsert=True
    )
    # Streak (server-side, includes today) for milestone toasts
    dates = await db.habit_log.find(
        {"user_id": uid, "habit": habit,
         "date": {"$gte": (today - timedelta(days=90)).isoformat()}},
        {"_id": 0, "date": 1},
    ).to_list(200)
    streak = _streak_from_dates({d["date"] for d in dates}, today)
    milestone = streak in (7, 21, 30)
    return {
        "ok": True, "habit": habit, "minutes": minutes, "kcal_est": kcal,
        "streak": streak, "milestone": milestone, "weight_missing": weight is None,
    }


@api_router.delete("/habits/log")
async def habits_unlog(habit: str, current=Depends(get_current_user)):
    """Undo today's tap. `habit` passed as a query param (DELETE has no body)."""
    uid = current["user_id"]
    date = _now().date().isoformat()
    await db.habit_log.delete_one({"user_id": uid, "habit": habit, "date": date})
    return {"ok": True, "habit": habit}


def _consumed_kcal(plan: Dict[str, Any]) -> Optional[float]:
    """Sum kcal of dishes actually cooked in a plan doc; None if nothing cooked."""
    total = 0.0
    any_cooked = False
    for m in ("breakfast", "lunch", "dinner"):
        for it in (plan.get(m) or {}).get("items", []):
            if it.get("cooked"):
                any_cooked = True
                total += float((it.get("nutrition") or {}).get("kcal") or 0)
    return total if any_cooked else None


@api_router.get("/insights/path")
async def insights_path(current=Depends(get_current_user)):
    """Forward-looking, motivational, honest, SAFE-capped weight/streak projection.
    All pace math lives here so the 0.5 kg/week cap has a single home."""
    uid = current["user_id"]
    today = _now().date()
    profile = await db.profiles.find_one({"user_id": uid}, {"_id": 0}) or {}
    health = profile.get("health") or {}
    rules = await db.meal_rules.find_one({"key": "default"}, {"_id": 0}) or {}
    targets = daily_targets(rules, profile)
    tdee = float(targets.get("kcal") or 1660)

    weight = health.get("weight_kg")
    target = health.get("target_weight_kg")

    # Last 7 days: intake (cooked) + activity burn + adherence
    dates = [(today - timedelta(days=i)).isoformat() for i in range(7)]
    plans = await db.meal_plans.find(
        {"user_id": uid, "date": {"$in": dates}}, {"_id": 0}
    ).to_list(20)
    intakes = [c for c in (_consumed_kcal(p) for p in plans) if c is not None]
    logged_days = len(intakes)
    on_plan_days = sum(
        1 for c in intakes if abs(c - tdee) <= 0.25 * tdee
    )
    adherence = round(on_plan_days / 7.0, 2)

    habit_docs = await db.habit_log.find(
        {"user_id": uid, "date": {"$in": dates}}, {"_id": 0}
    ).to_list(500)
    burnt_week = int(sum(int(h.get("kcal_est") or 0) for h in habit_docs))
    avg_burnt = burnt_week / 7.0

    lines: List[Dict[str, str]] = []
    has_target = weight is not None and target is not None
    pace = None
    projected_30d = None
    eta_label = None

    if has_target and target < weight:
        avg_intake = sum(intakes) / len(intakes) if intakes else None
        # expenditure = ICMR baseline + logged activity; deficit vs food intake
        if avg_intake is not None:
            daily_deficit = (tdee + avg_burnt) - avg_intake
        else:
            daily_deficit = avg_burnt  # honest floor: only what activity adds
        raw_pace = max(0.0, daily_deficit * 7.0 / 7700.0)
        pace = round(min(raw_pace, SAFE_PACE_KG_WEEK), 2)
        capped = raw_pace > SAFE_PACE_KG_WEEK
        if pace > 0.02:
            projected_30d = round(pace * (30.0 / 7.0), 1)
            weeks_to_target = (weight - target) / pace
            eta_date = today + timedelta(weeks=min(weeks_to_target, 260))
            eta_label = eta_date.strftime("%B %Y")
            lines.append({
                "icon": "trending-down",
                "tone": "good",
                "text": f"On your current pace: est. −{projected_30d} kg over the next 30 days.",
            })
            lines.append({
                "icon": "flag",
                "tone": "good",
                "text": f"Target {target:g} kg reachable around {eta_label} at a healthy pace.",
            })
            if capped:
                lines.append({
                    "icon": "shield-checkmark",
                    "tone": "info",
                    "text": "Captain paces you at a healthy ~0.5 kg/week — steady wins, soldier.",
                })
        else:
            lines.append({
                "icon": "restaurant",
                "tone": "info",
                "text": "Log a few more meals and check in your habits — I'll chart your pace, soldier.",
            })
    elif has_target and target >= weight:
        lines.append({
            "icon": "barbell",
            "tone": "good",
            "text": "Target set. Keep your plates full and your habits steady, soldier.",
        })
    else:
        lines.append({
            "icon": "flag",
            "tone": "info",
            "text": "Set a target weight in Settings → I'll chart your path, soldier.",
        })

    # Consistency praise / gentle reset (never shame)
    if logged_days >= 1:
        if adherence >= 0.7:
            lines.append({
                "icon": "ribbon", "tone": "good",
                "text": f"{on_plan_days} of 7 days on plan this week. Discipline looks good on you, soldier.",
            })
        elif adherence < 0.4:
            lines.append({
                "icon": "refresh", "tone": "info",
                "text": "Rough week? Today resets the line. One good plate at a time.",
            })

    # Streak-forward nudge (biggest active streak near a milestone)
    hb = await db.habit_log.find(
        {"user_id": uid, "date": {"$gte": (today - timedelta(days=90)).isoformat()}},
        {"_id": 0, "habit": 1, "date": 1},
    ).to_list(2000)
    per_habit: Dict[str, set] = {}
    for r in hb:
        per_habit.setdefault(r["habit"], set()).add(r["date"])
    best_habit, best_streak = None, 0
    for h, ds in per_habit.items():
        s = _streak_from_dates(ds, today)
        if s > best_streak:
            best_habit, best_streak = h, s
    if best_habit and best_streak >= 2:
        for milestone in (7, 21, 30):
            if 0 < milestone - best_streak <= 3:
                lbl = HABIT_LABELS.get(best_habit, best_habit).lower()
                lines.append({
                    "icon": "flame", "tone": "good",
                    "text": f"{milestone - best_streak} more days → {milestone}-day {lbl} streak \U0001F3C5",
                })
                break

    return {
        "has_target": has_target,
        "weight_kg": weight,
        "target_weight_kg": target,
        "pace_kg_per_week": pace,
        "projected_loss_30d_kg": projected_30d,
        "eta_label": eta_label,
        "adherence_pct": int(round(adherence * 100)),
        "logged_days": logged_days,
        "burnt_week_kcal": burnt_week,
        "best_streak": best_streak,
        "lines": lines[:4],
        "footer": "Estimates for general wellness — not medical advice.",
        "note": "Supports your health focus; not a diagnosis or treatment. Consult your doctor.",
    }


# ------------------------- Mount ------------------------- #
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
