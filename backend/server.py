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
    await db.recipes.delete_many({})
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
async def list_recipes(category: Optional[str] = None, diet: Optional[str] = None):
    query: Dict[str, Any] = {}
    if category:
        query["category"] = category
    if diet:
        query["diet"] = diet
    return await db.recipes.find(query, {"_id": 0}).to_list(1000)


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
    bmi: Optional[float] = None
    goals: List[str] = Field(default_factory=list)


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


@api_router.post("/pantry")
async def add_pantry(payload: PantryIn, current=Depends(get_current_user)):
    ing = await db.ingredients.find_one({"ingredient_id": payload.ingredient_id})
    if not ing:
        raise HTTPException(status_code=404, detail="Unknown ingredient")
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
