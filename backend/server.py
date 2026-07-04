from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import logging
from pathlib import Path
from typing import Any, Dict, List


ROOT_DIR = Path(__file__).parent
DATA_DIR = ROOT_DIR / "data"
load_dotenv(ROOT_DIR / ".env")

# MongoDB connection
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="AmmiAI API")
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("ammiai")


# ------------------------- Seeding ------------------------- #
async def _seed_ingredients() -> int:
    path = DATA_DIR / "shelf_life.json"
    with open(path, "r", encoding="utf-8") as f:
        items: List[Dict[str, Any]] = json.load(f)
    # Idempotent: drop & reload so any change to the source is picked up
    await db.ingredients.delete_many({})
    if items:
        await db.ingredients.insert_many(items)
    return len(items)


async def _seed_recipes() -> int:
    path = DATA_DIR / "recipes_ammiaai_v2.json"
    with open(path, "r", encoding="utf-8") as f:
        items: List[Dict[str, Any]] = json.load(f)
    await db.recipes.delete_many({})
    if items:
        await db.recipes.insert_many(items)
    return len(items)


async def _seed_meal_rules() -> int:
    path = DATA_DIR / "meal_combination_rules.json"
    with open(path, "r", encoding="utf-8") as f:
        doc: Dict[str, Any] = json.load(f)
    await db.meal_rules.delete_many({})
    # Store as a single document with key="default"
    doc_to_store = {"key": "default", **doc}
    await db.meal_rules.insert_one(doc_to_store)
    # Count top-level template groups for the counter (breakfast/lunch/dinner)
    templates = doc.get("meal_templates", {})
    return len(templates) if isinstance(templates, dict) else 0


@app.on_event("startup")
async def on_startup() -> None:
    logger.info("AmmiAI: seeding reference data...")
    try:
        n_ing = await _seed_ingredients()
        n_rec = await _seed_recipes()
        n_rules = await _seed_meal_rules()
        logger.info(
            "AmmiAI: seeded ingredients=%s, recipes=%s, meal_template_groups=%s",
            n_ing,
            n_rec,
            n_rules,
        )
    except Exception as exc:  # pragma: no cover - startup safety
        logger.exception("AmmiAI: failed to seed reference data: %s", exc)


# ------------------------- Routes ------------------------- #
@api_router.get("/")
async def root():
    return {"app": "AmmiAI", "status": "ok"}


@api_router.get("/stats")
async def get_stats():
    n_ing = await db.ingredients.count_documents({})
    n_rec = await db.recipes.count_documents({})
    n_rules = await db.meal_rules.count_documents({})
    # Recipe category breakdown for the home screen
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
async def list_recipes(category: str | None = None, diet: str | None = None):
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


# Include the router in the main app
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
