from fastapi import FastAPI, APIRouter, Header, HTTPException, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
import re
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta, date as date_cls
import httpx
from fastapi.responses import StreamingResponse

from taco_foods import search_taco, find_taco, TACO_NAMES

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

app = FastAPI()


@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("nutrify")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def now_utc():
    return datetime.now(timezone.utc)


def new_id(prefix: str = ""):
    h = uuid.uuid4().hex[:12]
    return f"{prefix}{h}" if prefix else h


def today_str():
    return now_utc().date().isoformat()


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
class SessionRequest(BaseModel):
    session_id: str


async def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1].strip()
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires = session.get("expires_at")
    if isinstance(expires, datetime):
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < now_utc():
            raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"], "deleted_at": None}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@api_router.post("/auth/session")
async def create_session(req: SessionRequest):
    async with httpx.AsyncClient(timeout=20) as hc:
        resp = await hc.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": req.session_id},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")
    data = resp.json()
    email = data.get("email")
    name = data.get("name")
    picture = data.get("picture")
    session_token = data.get("session_token")
    if not email or not session_token:
        raise HTTPException(status_code=401, detail="Invalid session data")

    # Deleted accounts are removed entirely, so a returning email always starts fresh.
    existing = await db.users.find_one({"email": email, "deleted_at": None})
    if existing:
        user_id = existing["user_id"]
    else:
        user_id = new_id("user_")
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "created_at": now_utc(),
            "deleted_at": None,
        })

    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "created_at": now_utc(),
        "expires_at": now_utc() + timedelta(days=7),
    })

    profile = await db.profiles.find_one({"user_id": user_id}, {"_id": 0})
    return {
        "session_token": session_token,
        "user": {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "onboarded": bool(profile and profile.get("onboarded")),
        },
    }


@api_router.get("/auth/me")
async def auth_me(user: Dict[str, Any] = Depends(get_current_user)):
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user.get("name"),
        "picture": user.get("picture"),
        "onboarded": bool(profile and profile.get("onboarded")),
    }


@api_router.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Nutrition calculations
# ---------------------------------------------------------------------------
ACTIVITY_MULTIPLIERS = {
    "sedentary": 1.2,
    "light": 1.375,
    "moderate": 1.55,
    "active": 1.725,
    "very_active": 1.9,
}

GOAL_CALORIE_ADJUST = {
    "emagrecimento": -0.20,
    "ganho_massa": 0.12,
    "manutencao": 0.0,
    "recomposicao": -0.08,
    "performance": 0.08,
}

GOAL_PROTEIN_PER_KG = {
    "emagrecimento": 2.0,
    "ganho_massa": 2.0,
    "manutencao": 1.6,
    "recomposicao": 2.2,
    "performance": 1.8,
}


def compute_age(birth_date: str) -> int:
    try:
        b = datetime.fromisoformat(birth_date).date()
    except Exception:
        return 30
    t = now_utc().date()
    return max(14, t.year - b.year - ((t.month, t.day) < (b.month, b.day)))


def compute_goals(profile: Dict[str, Any]) -> Dict[str, Any]:
    weight = float(profile.get("weight_kg") or 70)
    height = float(profile.get("height_cm") or 170)
    sex = profile.get("sex", "male")
    age = compute_age(profile.get("birth_date", "")) if profile.get("birth_date") else 30
    goal = profile.get("goal", "manutencao")
    athlete = bool(profile.get("athlete_mode"))
    activity = profile.get("activity_level", "moderate")

    bmr = 10 * weight + 6.25 * height - 5 * age + (5 if sex == "male" else -161)

    # In athlete mode the activity multiplier is reduced to NEAT only, because
    # exercise calories are logged per day (avoids double-counting).
    mult = 1.2 if athlete else ACTIVITY_MULTIPLIERS.get(activity, 1.55)
    tdee = bmr * mult

    custom = profile.get("custom_goals")
    if custom and custom.get("calories"):
        calories = float(custom["calories"])
        protein = float(custom.get("protein", 0))
        fat = float(custom.get("fat", 0))
        carbs = float(custom.get("carbs", 0))
    else:
        calories = tdee * (1 + GOAL_CALORIE_ADJUST.get(goal, 0.0))
        protein = GOAL_PROTEIN_PER_KG.get(goal, 1.8) * weight
        fat = (calories * 0.27) / 9
        carbs_kcal = calories - (protein * 4) - (fat * 9)
        carbs = max(0, carbs_kcal / 4)

    return {
        "bmr": round(bmr),
        "tdee": round(tdee),
        "calories": round(calories),
        "protein": round(protein),
        "carbs": round(carbs),
        "fat": round(fat),
        "athlete_mode": athlete,
        "water_goal_ml": int(profile.get("water_goal_ml") or round(weight * 35)),
    }


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------
class ProfileInput(BaseModel):
    name: Optional[str] = None
    birth_date: Optional[str] = None
    sex: Optional[str] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    goal_weight_kg: Optional[float] = None
    activity_level: Optional[str] = None
    goal: Optional[str] = None
    athlete_mode: Optional[bool] = None
    water_goal_ml: Optional[int] = None
    custom_goals: Optional[Dict[str, float]] = None


@api_router.get("/profile")
async def get_profile(user: Dict[str, Any] = Depends(get_current_user)):
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not profile:
        return {"onboarded": False, "name": user.get("name")}
    profile["goals"] = compute_goals(profile)
    return profile


@api_router.put("/profile")
async def update_profile(data: ProfileInput, user: Dict[str, Any] = Depends(get_current_user)):
    updates = {k: v for k, v in data.dict().items() if v is not None}
    updates["onboarded"] = True
    updates["updated_at"] = now_utc()
    existing = await db.profiles.find_one({"user_id": user["user_id"]})
    if existing:
        await db.profiles.update_one({"user_id": user["user_id"]}, {"$set": updates})
    else:
        updates["user_id"] = user["user_id"]
        updates["created_at"] = now_utc()
        await db.profiles.insert_one(updates)
        # seed weight history with current weight
        if updates.get("weight_kg"):
            await db.weights.update_one(
                {"user_id": user["user_id"], "date": today_str()},
                {"$set": {"weight_kg": float(updates["weight_kg"]), "updated_at": now_utc()},
                 "$setOnInsert": {"id": new_id(), "created_at": now_utc()}},
                upsert=True,
            )
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    profile["goals"] = compute_goals(profile)
    return profile


@api_router.get("/goals")
async def get_goals(user: Dict[str, Any] = Depends(get_current_user)):
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return compute_goals(profile)


@api_router.delete("/account")
async def delete_account(user: Dict[str, Any] = Depends(get_current_user)):
    """Permanent deletion (LGPD): removes the account and every piece of user data."""
    uid = user["user_id"]
    for coll in USER_DATA_COLLECTIONS:
        await db[coll].delete_many({"user_id": uid})
    await db.users.delete_one({"user_id": uid})
    return {"ok": True}


USER_DATA_COLLECTIONS = [
    "user_sessions", "profiles", "diary", "weights", "water", "workouts",
    "recipes", "favorites", "custom_foods", "chat_messages",
]


# ---------------------------------------------------------------------------
# Food search (Open Food Facts)
# ---------------------------------------------------------------------------
def _num(v, default=0.0):
    try:
        if v is None or v == "":
            return default
        return float(v)
    except Exception:
        return default


def normalize_off_product(p: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    n = p.get("nutriments", {}) or {}
    name = p.get("product_name_pt") or p.get("product_name") or p.get("generic_name_pt") or p.get("generic_name")
    if isinstance(name, list):
        name = name[0] if name else None
    if not name:
        return None
    brands = p.get("brands")
    if isinstance(brands, list):
        brand = (brands[0] if brands else None)
    elif isinstance(brands, str):
        brand = brands.split(",")[0].strip() or None
    else:
        brand = None
    kcal = n.get("energy-kcal_100g")
    if kcal is None and n.get("energy_100g"):
        kcal = _num(n.get("energy_100g")) / 4.184
    sodium = n.get("sodium_100g")
    if sodium is None and n.get("salt_100g") is not None:
        sodium = _num(n.get("salt_100g")) * 400  # mg
    else:
        sodium = _num(sodium) * 1000 if sodium is not None else 0
    return {
        "source": "off",
        "code": p.get("code"),
        "name": str(name).strip(),
        "brand": brand,
        "calories": round(_num(kcal), 1),
        "protein": round(_num(n.get("proteins_100g")), 1),
        "carbs": round(_num(n.get("carbohydrates_100g")), 1),
        "fat": round(_num(n.get("fat_100g")), 1),
        "fiber": round(_num(n.get("fiber_100g")), 1),
        "sugars": round(_num(n.get("sugars_100g")), 1),
        "sodium": round(sodium, 1),
        "serving": p.get("serving_size"),
        "image": p.get("image_front_small_url") or p.get("image_small_url") or p.get("image_url"),
    }


@api_router.get("/foods/search")
async def search_foods(q: str, user: Dict[str, Any] = Depends(get_current_user)):
    results = []
    # user custom foods first
    custom = await db.custom_foods.find(
        {"user_id": user["user_id"], "name": {"$regex": re.escape(q), "$options": "i"}, "deleted_at": None},
        {"_id": 0},
    ).to_list(20)
    for c in custom:
        c["source"] = "custom"
        results.append(c)
    # Brazilian reference foods (TACO) next
    results.extend(search_taco(q))

    async def off_search(query: str) -> List[Dict[str, Any]]:
        async with httpx.AsyncClient(timeout=20) as hc:
            resp = await hc.get(
                "https://search.openfoodfacts.org/search",
                params={
                    "q": query,
                    "page_size": 30,
                    "fields": "code,product_name,product_name_pt,brands,nutriments,image_url",
                },
                headers={"User-Agent": "Nutrify/1.0 (contact@nutrify.app)"},
            )
        if resp.status_code != 200:
            raise RuntimeError(f"OFF search HTTP {resp.status_code}")
        out = []
        for p in resp.json().get("hits", []):
            item = normalize_off_product(p)
            if item and item["calories"] > 0:
                out.append(item)
        return out

    external_available = True
    try:
        # Prefer products sold in Brazil; fall back to worldwide if few results
        off = await off_search(f'{q} countries_tags:"en:brazil"')
        if len(off) < 5:
            seen = {o["code"] for o in off}
            off += [o for o in await off_search(q) if o["code"] not in seen]
        results.extend(off)
    except Exception as e:
        external_available = False
        logger.warning(f"OFF search failed: {e}")
    return {"results": results[:50], "external_available": external_available}


@api_router.get("/foods/barcode/{code}")
async def food_by_barcode(code: str, user: Dict[str, Any] = Depends(get_current_user)):
    if not code.isdigit() or not 8 <= len(code) <= 14:
        raise HTTPException(status_code=400, detail="Código de barras inválido")
    fields = "code,product_name,product_name_pt,generic_name,generic_name_pt,brands,nutriments,serving_size,image_front_small_url,image_small_url"
    # Brazilian mirror first, then the world database (same data, different hosts for resilience)
    for host in ("br.openfoodfacts.org", "world.openfoodfacts.org"):
        try:
            async with httpx.AsyncClient(timeout=12) as hc:
                resp = await hc.get(
                    f"https://{host}/api/v2/product/{code}.json",
                    params={"fields": fields},
                    headers={"User-Agent": "Nutrify/1.0 (contact@nutrify.app)"},
                )
            if resp.status_code >= 500 or "json" not in resp.headers.get("content-type", ""):
                continue
            data = resp.json()
        except Exception as e:
            logger.warning(f"OFF barcode failed on {host}: {e}")
            continue
        item = normalize_off_product(data["product"]) if data.get("status") == 1 else None
        if item:
            return item
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    raise HTTPException(status_code=503, detail="Base de produtos indisponível no momento. Tente novamente.")


class CustomFoodInput(BaseModel):
    name: str
    brand: Optional[str] = None
    calories: float
    protein: float = 0
    carbs: float = 0
    fat: float = 0
    fiber: float = 0
    sugars: float = 0
    sodium: float = 0


@api_router.post("/foods/custom")
async def create_custom_food(data: CustomFoodInput, user: Dict[str, Any] = Depends(get_current_user)):
    doc = data.dict()
    doc.update({"id": new_id(), "user_id": user["user_id"], "source": "custom",
                "created_at": now_utc(), "deleted_at": None, "serving": "100 g"})
    await db.custom_foods.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/foods/custom")
async def list_custom_foods(user: Dict[str, Any] = Depends(get_current_user)):
    items = await db.custom_foods.find({"user_id": user["user_id"], "deleted_at": None}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for i in items:
        i["source"] = "custom"
    return {"results": items}


# Recipes (multi-ingredient). Ingredients store per-100g values + grams.
class RecipeIngredient(BaseModel):
    name: str
    brand: Optional[str] = None
    code: Optional[str] = None
    source: Optional[str] = None
    grams: float
    calories: float
    protein: float = 0
    carbs: float = 0
    fat: float = 0
    fiber: float = 0


class RecipeInput(BaseModel):
    name: str
    servings: float = 1
    ingredients: List[RecipeIngredient]


def recipe_view(r: Dict[str, Any]) -> Dict[str, Any]:
    """Expose a recipe as a food (per-100g values) so it can be logged like any food."""
    total_g = sum(i["grams"] for i in r["ingredients"]) or 1
    totals = {k: sum(i.get(k, 0) * i["grams"] / 100 for i in r["ingredients"]) for k in ["calories", "protein", "carbs", "fat", "fiber"]}
    servings = r.get("servings") or 1
    serving_g = round(total_g / servings)
    r.update({
        "source": "recipe",
        "total_grams": round(total_g),
        "serving_grams": serving_g,
        "serving": f"1 porção ({serving_g} g)",
        "totals": {k: round(v, 1) for k, v in totals.items()},
        **{k: round(v / total_g * 100, 1) for k, v in totals.items()},
    })
    return r


async def _validated_recipe(data: RecipeInput) -> Dict[str, Any]:
    if len(data.name.strip()) < 2 or not data.ingredients or data.servings <= 0:
        raise HTTPException(status_code=400, detail="Informe nome, porções e ao menos um ingrediente")
    ings = [i.dict() for i in data.ingredients if i.grams > 0]
    if not ings:
        raise HTTPException(status_code=400, detail="Ingredientes precisam ter quantidade")
    return {"name": data.name.strip(), "servings": data.servings, "ingredients": ings}


@api_router.get("/recipes")
async def list_recipes(user: Dict[str, Any] = Depends(get_current_user)):
    items = await db.recipes.find({"user_id": user["user_id"], "deleted_at": None}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"results": [recipe_view(r) for r in items]}


@api_router.get("/recipes/{recipe_id}")
async def get_recipe(recipe_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    r = await db.recipes.find_one({"id": recipe_id, "user_id": user["user_id"], "deleted_at": None}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Receita não encontrada")
    return recipe_view(r)


@api_router.post("/recipes")
async def create_recipe(data: RecipeInput, user: Dict[str, Any] = Depends(get_current_user)):
    doc = await _validated_recipe(data)
    doc.update({"id": new_id(), "user_id": user["user_id"], "created_at": now_utc(), "deleted_at": None})
    await db.recipes.insert_one(doc)
    doc.pop("_id", None)
    return recipe_view(doc)


@api_router.put("/recipes/{recipe_id}")
async def update_recipe(recipe_id: str, data: RecipeInput, user: Dict[str, Any] = Depends(get_current_user)):
    doc = await _validated_recipe(data)
    res = await db.recipes.update_one({"id": recipe_id, "user_id": user["user_id"], "deleted_at": None}, {"$set": {**doc, "updated_at": now_utc()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Receita não encontrada")
    r = await db.recipes.find_one({"id": recipe_id}, {"_id": 0})
    return recipe_view(r)


@api_router.delete("/recipes/{recipe_id}")
async def delete_recipe(recipe_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    await db.recipes.update_one({"id": recipe_id, "user_id": user["user_id"]}, {"$set": {"deleted_at": now_utc()}})
    return {"ok": True}


# Favorites
class FavoriteInput(BaseModel):
    food: Dict[str, Any]


@api_router.get("/foods/favorites")
async def list_favorites(user: Dict[str, Any] = Depends(get_current_user)):
    items = await db.favorites.find({"user_id": user["user_id"], "deleted_at": None}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"results": items}


@api_router.post("/foods/favorites")
async def add_favorite(data: FavoriteInput, user: Dict[str, Any] = Depends(get_current_user)):
    doc = dict(data.food)
    doc.update({"id": new_id(), "user_id": user["user_id"], "created_at": now_utc(), "deleted_at": None})
    await db.favorites.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.delete("/foods/favorites/{fav_id}")
async def remove_favorite(fav_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    await db.favorites.update_one({"id": fav_id, "user_id": user["user_id"]}, {"$set": {"deleted_at": now_utc()}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Diary
# ---------------------------------------------------------------------------
MEALS = ["cafe_manha", "lanche_manha", "almoco", "lanche_tarde", "jantar", "ceia"]


class DiaryEntryInput(BaseModel):
    date: str
    meal: str
    name: str
    brand: Optional[str] = None
    grams: float
    # per-100g values
    calories: float
    protein: float = 0
    carbs: float = 0
    fat: float = 0
    fiber: float = 0
    sugars: float = 0
    sodium: float = 0
    source: Optional[str] = None
    code: Optional[str] = None


def entry_totals(e: Dict[str, Any]) -> Dict[str, float]:
    f = e["grams"] / 100.0
    return {
        "calories": round(e["calories"] * f, 1),
        "protein": round(e.get("protein", 0) * f, 1),
        "carbs": round(e.get("carbs", 0) * f, 1),
        "fat": round(e.get("fat", 0) * f, 1),
    }


@api_router.post("/diary")
async def add_diary_entry(data: DiaryEntryInput, user: Dict[str, Any] = Depends(get_current_user)):
    doc = data.dict()
    doc.update({"id": new_id(), "user_id": user["user_id"], "created_at": now_utc(), "deleted_at": None})
    await db.diary.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/diary/{entry_id}")
async def update_diary_entry(entry_id: str, grams: float, user: Dict[str, Any] = Depends(get_current_user)):
    await db.diary.update_one({"id": entry_id, "user_id": user["user_id"]}, {"$set": {"grams": grams}})
    doc = await db.diary.find_one({"id": entry_id, "user_id": user["user_id"]}, {"_id": 0})
    return doc


@api_router.delete("/diary/{entry_id}")
async def delete_diary_entry(entry_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    await db.diary.update_one({"id": entry_id, "user_id": user["user_id"]}, {"$set": {"deleted_at": now_utc()}})
    return {"ok": True}


class CopyInput(BaseModel):
    from_date: str
    to_date: str
    meal: Optional[str] = None


@api_router.post("/diary/copy")
async def copy_diary(data: CopyInput, user: Dict[str, Any] = Depends(get_current_user)):
    query = {"user_id": user["user_id"], "date": data.from_date, "deleted_at": None}
    if data.meal:
        query["meal"] = data.meal
    entries = await db.diary.find(query, {"_id": 0}).to_list(500)
    new_entries = []
    for e in entries:
        ne = dict(e)
        ne["id"] = new_id()
        ne["date"] = data.to_date
        ne["created_at"] = now_utc()
        new_entries.append(ne)
    if new_entries:
        await db.diary.insert_many(new_entries)
    return {"copied": len(new_entries)}


async def day_workout_calories(user_id: str, d: str) -> int:
    ws = await db.workouts.find({"user_id": user_id, "date": d, "deleted_at": None}, {"_id": 0}).to_list(100)
    return int(sum(w.get("calories", 0) for w in ws))


@api_router.get("/diary")
async def get_diary(date: str, user: Dict[str, Any] = Depends(get_current_user)):
    entries = await db.diary.find(
        {"user_id": user["user_id"], "date": date, "deleted_at": None}, {"_id": 0}
    ).sort("created_at", 1).to_list(500)

    meals = {m: {"entries": [], "calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0} for m in MEALS}
    totals = {"calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0}
    for e in entries:
        t = entry_totals(e)
        e["computed"] = t
        m = e.get("meal", "almoco")
        if m not in meals:
            meals[m] = {"entries": [], "calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0}
        meals[m]["entries"].append(e)
        for k in totals:
            meals[m][k] += t[k]
            totals[k] += t[k]
    for m in meals:
        for k in ["calories", "protein", "carbs", "fat"]:
            meals[m][k] = round(meals[m][k], 1)
    for k in totals:
        totals[k] = round(totals[k], 1)

    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    goals = compute_goals(profile) if profile else {"calories": 2000, "protein": 120, "carbs": 220, "fat": 60, "athlete_mode": False, "water_goal_ml": 2500}
    workout_cals = await day_workout_calories(user["user_id"], date)
    target_calories = goals["calories"] + (workout_cals if goals.get("athlete_mode") else 0)

    return {
        "date": date,
        "meals": meals,
        "totals": totals,
        "goals": goals,
        "target_calories": target_calories,
        "workout_calories": workout_cals,
    }


# ---------------------------------------------------------------------------
# Water
# ---------------------------------------------------------------------------
class WaterInput(BaseModel):
    date: str
    amount_ml: int


@api_router.post("/water")
async def add_water(data: WaterInput, user: Dict[str, Any] = Depends(get_current_user)):
    await db.water.update_one(
        {"user_id": user["user_id"], "date": data.date},
        {"$inc": {"total_ml": data.amount_ml}, "$set": {"updated_at": now_utc()}},
        upsert=True,
    )
    doc = await db.water.find_one({"user_id": user["user_id"], "date": data.date}, {"_id": 0})
    return doc


@api_router.get("/water")
async def get_water(date: str, user: Dict[str, Any] = Depends(get_current_user)):
    doc = await db.water.find_one({"user_id": user["user_id"], "date": date}, {"_id": 0})
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    goal = int(profile.get("water_goal_ml")) if profile and profile.get("water_goal_ml") else (round(float(profile.get("weight_kg", 70)) * 35) if profile else 2500)
    return {"date": date, "total_ml": (doc or {}).get("total_ml", 0), "goal_ml": goal}


# ---------------------------------------------------------------------------
# Weight
# ---------------------------------------------------------------------------
class WeightInput(BaseModel):
    weight_kg: float
    date: Optional[str] = None


@api_router.post("/weight")
async def add_weight(data: WeightInput, user: Dict[str, Any] = Depends(get_current_user)):
    d = data.date or today_str()
    await db.weights.update_one(
        {"user_id": user["user_id"], "date": d},
        {"$set": {"weight_kg": data.weight_kg, "created_at": now_utc(), "id": new_id()}},
        upsert=True,
    )
    await db.profiles.update_one({"user_id": user["user_id"]}, {"$set": {"weight_kg": data.weight_kg}})
    doc = await db.weights.find_one({"user_id": user["user_id"], "date": d}, {"_id": 0})
    return doc


@api_router.get("/weight")
async def list_weight(user: Dict[str, Any] = Depends(get_current_user)):
    items = await db.weights.find({"user_id": user["user_id"]}, {"_id": 0}).sort("date", 1).to_list(500)
    return {"results": items}


# ---------------------------------------------------------------------------
# Workouts (Athlete mode)
# ---------------------------------------------------------------------------
class WorkoutInput(BaseModel):
    date: str
    type: str  # musculacao, corrida, ciclismo, outro
    duration_min: int
    calories: int


@api_router.post("/workouts")
async def add_workout(data: WorkoutInput, user: Dict[str, Any] = Depends(get_current_user)):
    doc = data.dict()
    doc.update({"id": new_id(), "user_id": user["user_id"], "created_at": now_utc(), "deleted_at": None})
    await db.workouts.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/workouts")
async def list_workouts(date: str, user: Dict[str, Any] = Depends(get_current_user)):
    items = await db.workouts.find({"user_id": user["user_id"], "date": date, "deleted_at": None}, {"_id": 0}).sort("created_at", 1).to_list(100)
    return {"results": items}


@api_router.delete("/workouts/{workout_id}")
async def delete_workout(workout_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    await db.workouts.update_one({"id": workout_id, "user_id": user["user_id"]}, {"$set": {"deleted_at": now_utc()}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------
@api_router.get("/reports")
async def get_reports(period: str = "week", user: Dict[str, Any] = Depends(get_current_user)):
    days = 7 if period == "week" else (30 if period == "month" else 7)
    today = now_utc().date()
    date_list = [(today - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]

    entries = await db.diary.find(
        {"user_id": user["user_id"], "date": {"$in": date_list}, "deleted_at": None}, {"_id": 0}
    ).to_list(5000)

    daily = {d: {"calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0} for d in date_list}
    for e in entries:
        t = entry_totals(e)
        d = e["date"]
        if d in daily:
            for k in daily[d]:
                daily[d][k] += t[k]

    logged_days = [d for d in date_list if daily[d]["calories"] > 0]
    n = max(1, len(logged_days))
    avg = {k: round(sum(daily[d][k] for d in logged_days) / n, 1) for k in ["calories", "protein", "carbs", "fat"]}

    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    goals = compute_goals(profile) if profile else {"calories": 2000, "protein": 120, "carbs": 220, "fat": 60}

    weights = await db.weights.find({"user_id": user["user_id"]}, {"_id": 0}).sort("date", 1).to_list(500)

    return {
        "period": period,
        "daily": [{"date": d, **{k: round(daily[d][k], 1) for k in daily[d]}} for d in date_list],
        "averages": avg,
        "goals": goals,
        "weights": weights,
    }


# ---------------------------------------------------------------------------
# AI food recognition
# ---------------------------------------------------------------------------
class RecognizeInput(BaseModel):
    image_base64: str


@api_router.post("/ai/recognize")
async def recognize_food(data: RecognizeInput, user: Dict[str, Any] = Depends(get_current_user)):
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

    b64 = data.image_base64
    if "," in b64 and b64.strip().startswith("data:"):
        b64 = b64.split(",", 1)[1]

    system = (
        "Você é um nutricionista que identifica alimentos em fotos. "
        "Responda SOMENTE com JSON válido, sem texto extra. "
        'Formato: {"foods":[{"name":"...","grams":<número estimado da porção em g>,'
        '"calories":<kcal totais da porção>,"protein":<g>,"carbs":<g>,"fat":<g>}],'
        '"note":"breve observação em português"}. '
        "Estime valores com base em porções típicas brasileiras. "
        "Se não houver comida na imagem, retorne foods vazio e explique na note."
    )
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"recognize_{new_id()}", system_message=system).with_model("openai", "gpt-5.6-terra")
    msg = UserMessage(
        text="Identifique os alimentos nesta foto e estime a composição nutricional de cada um.",
        file_contents=[ImageContent(image_base64=b64)],
    )
    try:
        resp = await chat.send_message(msg)
    except Exception as e:
        logger.error(f"AI recognize failed: {e}")
        raise HTTPException(status_code=502, detail="Falha ao analisar a imagem")

    text = resp if isinstance(resp, str) else str(resp)
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return {"foods": [], "note": "Não foi possível interpretar a imagem."}
    try:
        parsed = json.loads(m.group(0))
    except Exception:
        return {"foods": [], "note": "Não foi possível interpretar a imagem."}

    foods = []
    for f in parsed.get("foods", []):
        try:
            foods.append({
                "name": str(f.get("name", "Alimento")),
                "grams": round(float(f.get("grams", 100)), 0),
                "calories": round(float(f.get("calories", 0)), 1),
                "protein": round(float(f.get("protein", 0)), 1),
                "carbs": round(float(f.get("carbs", 0)), 1),
                "fat": round(float(f.get("fat", 0)), 1),
            })
        except Exception:
            continue
    return {"foods": foods, "note": parsed.get("note", "")}


# ---------------------------------------------------------------------------
# AI nutrition assistant (chat, GPT-5.5)
# ---------------------------------------------------------------------------
CHAT_MODEL = ("openai", "gpt-5.5")
CHAT_HISTORY_LIMIT = 20


class ChatInput(BaseModel):
    message: str
    date: Optional[str] = None  # client local date YYYY-MM-DD


async def build_chat_context(user: Dict[str, Any], d: str) -> str:
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    goals = compute_goals(profile) if profile else {}
    entries = await db.diary.find({"user_id": user["user_id"], "date": d, "deleted_at": None}, {"_id": 0}).to_list(200)
    totals = {"calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0}
    lines = []
    for e in entries:
        t = entry_totals(e)
        for k in totals:
            totals[k] += t[k]
        lines.append(f"- {e.get('meal')}: {e.get('name')} {round(e['grams'])}g ({round(t['calories'])} kcal)")
    water = await db.water.find_one({"user_id": user["user_id"], "date": d}, {"_id": 0}) or {}
    workout_kcal = await day_workout_calories(user["user_id"], d)
    age = compute_age(profile["birth_date"]) if profile.get("birth_date") else None
    return (
        f"Nome: {profile.get('name') or user.get('name')}\n"
        f"Sexo: {profile.get('sex')}, idade: {age}, altura: {profile.get('height_cm')} cm, "
        f"peso: {profile.get('weight_kg')} kg, peso desejado: {profile.get('goal_weight_kg')} kg\n"
        f"Objetivo: {profile.get('goal')}, atividade: {profile.get('activity_level')}, "
        f"modo atleta: {bool(profile.get('athlete_mode'))}\n"
        f"Metas diárias: {goals.get('calories')} kcal, P {goals.get('protein')} g, "
        f"C {goals.get('carbs')} g, G {goals.get('fat')} g, água {goals.get('water_goal_ml')} ml\n"
        f"Hoje ({d}) consumido: {round(totals['calories'])} kcal, P {round(totals['protein'])} g, "
        f"C {round(totals['carbs'])} g, G {round(totals['fat'])} g; água {water.get('total_ml', 0)} ml; "
        f"treino {workout_kcal} kcal\n"
        f"Alimentos de hoje:\n" + ("\n".join(lines) if lines else "- nenhum registrado")
    )


class SuggestInput(BaseModel):
    meal: str = "almoco"
    date: Optional[str] = None


MEAL_NAMES_PT = {
    "cafe_manha": "café da manhã", "lanche_manha": "lanche da manhã", "almoco": "almoço",
    "lanche_tarde": "lanche da tarde", "jantar": "jantar", "ceia": "ceia",
}


@api_router.post("/ai/meal-suggestions")
async def meal_suggestions(data: SuggestInput, user: Dict[str, Any] = Depends(get_current_user)):
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    d = data.date or today_str()
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    goals = compute_goals(profile)
    entries = await db.diary.find({"user_id": user["user_id"], "date": d, "deleted_at": None}, {"_id": 0}).to_list(200)
    consumed = {"calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0}
    for e in entries:
        t = entry_totals(e)
        for k in consumed:
            consumed[k] += t[k]
    target_cal = goals["calories"] + (await day_workout_calories(user["user_id"], d) if goals["athlete_mode"] else 0)
    remaining = {
        "calories": max(0, round(target_cal - consumed["calories"])),
        "protein": max(0, round(goals["protein"] - consumed["protein"])),
        "carbs": max(0, round(goals["carbs"] - consumed["carbs"])),
        "fat": max(0, round(goals["fat"] - consumed["fat"])),
    }
    meal_pt = MEAL_NAMES_PT.get(data.meal, data.meal)
    system = (
        "Você é um nutricionista brasileiro. Monte refeições típicas brasileiras usando SOMENTE alimentos desta lista "
        "(use o nome EXATAMENTE como escrito): " + "; ".join(TACO_NAMES) + ". "
        'Responda SOMENTE com JSON válido: {"suggestions":[{"title":"...","description":"frase curta","items":[{"name":"<nome da lista>","grams":<número>}]}]}. '
        "Gere 3 opções diferentes, com 2 a 5 itens cada, porções realistas."
    )
    prompt = (
        f"Refeição: {meal_pt}. Objetivo do usuário: {profile.get('goal', 'manutencao')}. "
        f"Ainda faltam hoje: {remaining['calories']} kcal, {remaining['protein']} g proteína, "
        f"{remaining['carbs']} g carboidratos, {remaining['fat']} g gordura. "
        "Monte cada opção para cobrir uma parte adequada do que falta para esta refeição "
        "(sem ultrapassar as calorias restantes; se faltar pouco, sugira algo leve), priorizando proteína."
    )
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"suggest_{new_id()}", system_message=system).with_model(*CHAT_MODEL)
    try:
        resp = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        logger.error(f"meal suggestions failed: {e}")
        raise HTTPException(status_code=502, detail="Não foi possível gerar sugestões agora")
    m = re.search(r"\{.*\}", str(resp), re.DOTALL)
    try:
        parsed = json.loads(m.group(0)) if m else {}
    except Exception:
        parsed = {}

    suggestions = []
    for s in parsed.get("suggestions", []):
        items = []
        for it in s.get("items", []):
            food = find_taco(str(it.get("name", "")))
            try:
                grams = float(it.get("grams", 100))
            except Exception:
                grams = 100.0
            if not food or grams <= 0:
                continue
            f = grams / 100
            items.append({**food, "grams": round(grams), "computed": {
                "calories": round(food["calories"] * f), "protein": round(food["protein"] * f, 1),
                "carbs": round(food["carbs"] * f, 1), "fat": round(food["fat"] * f, 1)}})
        if items:
            totals = {k: round(sum(i["computed"][k] for i in items), 1) for k in ["calories", "protein", "carbs", "fat"]}
            suggestions.append({"id": new_id(), "title": str(s.get("title", "Sugestão")), "description": str(s.get("description", "")), "items": items, "totals": totals})
    return {"meal": data.meal, "remaining": remaining, "suggestions": suggestions}


@api_router.get("/chat/messages")
async def get_chat_messages(user: Dict[str, Any] = Depends(get_current_user)):
    msgs = await db.chat_messages.find({"user_id": user["user_id"]}, {"_id": 0, "user_id": 0}).sort("created_at", -1).to_list(100)
    msgs.reverse()
    return {"messages": msgs}


@api_router.delete("/chat/messages")
async def clear_chat_messages(user: Dict[str, Any] = Depends(get_current_user)):
    await db.chat_messages.delete_many({"user_id": user["user_id"]})
    return {"ok": True}


@api_router.post("/chat/stream")
async def chat_stream(data: ChatInput, user: Dict[str, Any] = Depends(get_current_user)):
    from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

    text = data.message.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Mensagem vazia")
    d = data.date or today_str()
    context = await build_chat_context(user, d)
    system = (
        "Você é a Nutri, assistente nutricional do app Nutrify. Responda sempre em português do Brasil, "
        "de forma clara, acolhedora e objetiva (respostas curtas). Não use markdown (sem **, # ou tabelas); "
        "para listas use linhas iniciadas com •. "
        "Use os dados do usuário abaixo para personalizar as respostas (metas, o que já comeu hoje, o que falta). "
        "Priorize alimentos brasileiros do dia a dia. Não faça diagnósticos médicos; para condições de saúde, "
        "recomende procurar um nutricionista ou médico.\n\nDADOS DO USUÁRIO:\n" + context
    )
    history = await db.chat_messages.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(CHAT_HISTORY_LIMIT)
    history.reverse()
    initial = [{"role": "system", "content": system}] + [{"role": m["role"], "content": m["content"]} for m in history]

    await db.chat_messages.insert_one({"id": new_id(), "user_id": user["user_id"], "role": "user", "content": text, "created_at": now_utc()})

    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"chat_{user['user_id']}_{new_id()}", system_message=system, initial_messages=initial).with_model(*CHAT_MODEL)

    async def gen():
        parts: List[str] = []
        try:
            async for ev in chat.stream_message(UserMessage(text=text)):
                if isinstance(ev, TextDelta):
                    parts.append(ev.content)
                    yield f"data: {json.dumps({'delta': ev.content})}\n\n"
                elif isinstance(ev, StreamDone):
                    break
        except Exception as e:
            logger.error(f"chat stream failed: {e}")
            yield f"data: {json.dumps({'error': 'Não foi possível responder agora. Tente novamente.'})}\n\n"
        full = "".join(parts).strip()
        msg_id = new_id()
        if full:
            await db.chat_messages.insert_one({"id": msg_id, "user_id": user["user_id"], "role": "assistant", "content": full, "created_at": now_utc()})
        yield f"data: {json.dumps({'done': True, 'id': msg_id})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ---------------------------------------------------------------------------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.profiles.create_index("user_id", unique=True)
    await db.diary.create_index([("user_id", 1), ("date", 1)])
    await db.workouts.create_index([("user_id", 1), ("date", 1)])
    await db.weights.create_index([("user_id", 1), ("date", 1)], unique=True)
    await db.water.create_index([("user_id", 1), ("date", 1)], unique=True)
    await db.chat_messages.create_index([("user_id", 1), ("created_at", -1)])
    logger.info("Nutrify backend started")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
