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

    existing = await db.users.find_one({"email": email})
    if existing:
        user_id = existing["user_id"]
        if existing.get("deleted_at"):
            await db.users.update_one({"user_id": user_id}, {"$set": {"deleted_at": None}})
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
            await db.weights.insert_one({
                "id": new_id(), "user_id": user["user_id"],
                "weight_kg": float(updates["weight_kg"]),
                "date": today_str(), "created_at": now_utc(),
            })
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
    uid = user["user_id"]
    await db.users.update_one({"user_id": uid}, {"$set": {"deleted_at": now_utc()}})
    await db.user_sessions.delete_many({"user_id": uid})
    return {"ok": True}


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
    try:
        async with httpx.AsyncClient(timeout=20) as hc:
            resp = await hc.get(
                "https://search.openfoodfacts.org/search",
                params={
                    "q": q,
                    "page_size": 30,
                    "fields": "code,product_name,product_name_pt,brands,nutriments,image_url",
                },
                headers={"User-Agent": "Nutrify/1.0 (contact@nutrify.app)"},
            )
        if resp.status_code == 200:
            for p in resp.json().get("hits", []):
                item = normalize_off_product(p)
                if item and item["calories"] > 0:
                    results.append(item)
    except Exception as e:
        logger.warning(f"OFF search failed: {e}")
    return {"results": results[:40]}


@api_router.get("/foods/barcode/{code}")
async def food_by_barcode(code: str, user: Dict[str, Any] = Depends(get_current_user)):
    try:
        async with httpx.AsyncClient(timeout=15) as hc:
            resp = await hc.get(
                f"https://world.openfoodfacts.org/api/v2/product/{code}.json",
                params={"fields": "code,product_name,product_name_pt,generic_name,generic_name_pt,brands,nutriments,serving_size,image_front_small_url,image_small_url"},
                headers={"User-Agent": "Nutrify/1.0 (contact@nutrify.app)"},
            )
        data = resp.json()
        if data.get("status") == 1:
            item = normalize_off_product(data["product"])
            if item:
                return item
    except Exception as e:
        logger.warning(f"OFF barcode failed: {e}")
    raise HTTPException(status_code=404, detail="Produto não encontrado")


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
    logger.info("Nutrify backend started")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
