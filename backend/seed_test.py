import os
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
client = MongoClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

USER_ID = "user_testnutrify1"
EMAIL = "teste.nutrify@example.com"
TOKEN = "test-token-nutrify-123"

db.users.update_one(
    {"user_id": USER_ID},
    {"$set": {
        "user_id": USER_ID,
        "email": EMAIL,
        "name": "Usuário Teste",
        "picture": None,
        "created_at": datetime.now(timezone.utc),
        "deleted_at": None,
    }},
    upsert=True,
)

db.user_sessions.update_one(
    {"session_token": TOKEN},
    {"$set": {
        "session_token": TOKEN,
        "user_id": USER_ID,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=365),
    }},
    upsert=True,
)

db.profiles.update_one(
    {"user_id": USER_ID},
    {"$set": {
        "user_id": USER_ID,
        "onboarded": True,
        "name": "Usuário Teste",
        "sex": "male",
        "birth_date": "1995-05-20",
        "height_cm": 178,
        "weight_kg": 80,
        "goal_weight_kg": 75,
        "activity_level": "moderate",
        "goal": "emagrecimento",
        "athlete_mode": False,
        "updated_at": datetime.now(timezone.utc),
    }},
    upsert=True,
)

print("Seeded test user, session token:", TOKEN)

# Non-onboarded user (to test onboarding / birth date). Profile is removed on each run.
NEW_ID, NEW_TOKEN = "user_testnew1", "test-token-new-456"
db.users.update_one(
    {"user_id": NEW_ID},
    {"$set": {"user_id": NEW_ID, "email": "novo.nutrify@example.com", "name": "Novo Usuário",
              "picture": None, "created_at": datetime.now(timezone.utc), "deleted_at": None}},
    upsert=True,
)
db.user_sessions.update_one(
    {"session_token": NEW_TOKEN},
    {"$set": {"session_token": NEW_TOKEN, "user_id": NEW_ID, "created_at": datetime.now(timezone.utc),
              "expires_at": datetime.now(timezone.utc) + timedelta(days=365)}},
    upsert=True,
)
db.profiles.delete_one({"user_id": NEW_ID})
db.weights.delete_many({"user_id": NEW_ID})
print("Seeded non-onboarded user, session token:", NEW_TOKEN)
