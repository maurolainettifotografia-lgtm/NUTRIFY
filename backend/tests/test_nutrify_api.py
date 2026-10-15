"""Nutrify backend regression suite.

Covers auth, profile/goals, foods (OFF search, barcode, custom, favorites),
diary (CRUD + copy + totals/target), water, weight, workouts (athlete mode),
reports, and AI recognize endpoint.
"""
import base64
import io
import os
import time
from datetime import date, timedelta

import pytest
import requests

from conftest import BASE_URL, TOKEN  # noqa


# --- Auth -------------------------------------------------------------
class TestAuth:
    def test_auth_required_without_token(self):
        r = requests.get(f"{BASE_URL}/api/profile")
        assert r.status_code == 401

    def test_auth_required_bad_token(self):
        r = requests.get(f"{BASE_URL}/api/profile", headers={"Authorization": "Bearer wrong"})
        assert r.status_code == 401

    def test_auth_me(self, api):
        r = api.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == "teste.nutrify@example.com"
        assert data["user_id"] == "user_testnutrify1"
        assert data["onboarded"] is True


# --- Profile / Goals --------------------------------------------------
class TestProfileGoals:
    def test_get_profile(self, api):
        r = api.get(f"{BASE_URL}/api/profile")
        assert r.status_code == 200, r.text
        p = r.json()
        assert p.get("onboarded") is True
        assert "goals" in p
        for k in ("bmr", "tdee", "calories", "protein", "carbs", "fat", "water_goal_ml"):
            assert k in p["goals"]

    def test_get_goals(self, api):
        r = api.get(f"{BASE_URL}/api/goals")
        assert r.status_code == 200
        g = r.json()
        assert g["calories"] > 500
        assert g["protein"] > 0

    def test_put_profile_recomputes(self, api):
        # Save original
        orig = api.get(f"{BASE_URL}/api/profile").json()
        new_weight = (orig.get("weight_kg") or 75) + 5
        r = api.put(f"{BASE_URL}/api/profile", json={"weight_kg": new_weight})
        assert r.status_code == 200, r.text
        p = r.json()
        assert abs(p["weight_kg"] - new_weight) < 0.001
        assert p["goals"]["calories"] > 0
        # restore
        api.put(f"{BASE_URL}/api/profile", json={"weight_kg": orig.get("weight_kg") or 75})


# --- Foods ------------------------------------------------------------
class TestFoods:
    def test_search_arroz(self, api):
        r = api.get(f"{BASE_URL}/api/foods/search", params={"q": "arroz"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "results" in data
        # Open Food Facts may be slow; allow empty but prefer results
        if len(data["results"]) == 0:
            pytest.skip("Open Food Facts returned 0 results (external service)")
        item = data["results"][0]
        for k in ("name", "calories", "protein", "carbs", "fat"):
            assert k in item

    def test_barcode(self, api):
        r = api.get(f"{BASE_URL}/api/foods/barcode/7891000100103")
        assert r.status_code in (200, 404), r.text
        if r.status_code == 200:
            d = r.json()
            assert d["name"]
            assert "calories" in d

    def test_custom_food_create_and_list(self, api):
        payload = {"name": "TEST_Custom_Food", "calories": 150, "protein": 10, "carbs": 20, "fat": 5}
        r = api.post(f"{BASE_URL}/api/foods/custom", json=payload)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["name"] == payload["name"]
        assert "id" in created
        # verify list
        r2 = api.get(f"{BASE_URL}/api/foods/custom")
        assert r2.status_code == 200
        names = [i["name"] for i in r2.json()["results"]]
        assert payload["name"] in names

    def test_favorites_flow(self, api):
        food = {"name": "TEST_Fav_Food", "calories": 100, "protein": 5, "carbs": 10, "fat": 2}
        r = api.post(f"{BASE_URL}/api/foods/favorites", json={"food": food})
        assert r.status_code == 200, r.text
        fav_id = r.json()["id"]
        r2 = api.get(f"{BASE_URL}/api/foods/favorites")
        assert r2.status_code == 200
        assert any(f.get("id") == fav_id for f in r2.json()["results"])
        r3 = api.delete(f"{BASE_URL}/api/foods/favorites/{fav_id}")
        assert r3.status_code == 200
        r4 = api.get(f"{BASE_URL}/api/foods/favorites")
        assert not any(f.get("id") == fav_id for f in r4.json()["results"])


# --- Diary ------------------------------------------------------------
TODAY = date.today().isoformat()
YESTERDAY = (date.today() - timedelta(days=1)).isoformat()


class TestDiary:
    def test_add_update_delete_diary(self, api):
        payload = {
            "date": TODAY, "meal": "almoco", "name": "TEST_Entry",
            "grams": 150, "calories": 200, "protein": 10, "carbs": 20, "fat": 5,
        }
        r = api.post(f"{BASE_URL}/api/diary", json=payload)
        assert r.status_code == 200, r.text
        entry_id = r.json()["id"]

        r2 = api.get(f"{BASE_URL}/api/diary", params={"date": TODAY})
        assert r2.status_code == 200
        d = r2.json()
        assert "meals" in d and "almoco" in d["meals"]
        found = any(e["id"] == entry_id for e in d["meals"]["almoco"]["entries"])
        assert found
        # computed check: 150g of 200kcal/100g = 300kcal
        for e in d["meals"]["almoco"]["entries"]:
            if e["id"] == entry_id:
                assert abs(e["computed"]["calories"] - 300.0) < 0.5
                break
        assert d["target_calories"] >= d["goals"]["calories"]

        # update grams
        r3 = api.put(f"{BASE_URL}/api/diary/{entry_id}", params={"grams": 200})
        assert r3.status_code == 200
        assert r3.json()["grams"] == 200

        # delete
        r4 = api.delete(f"{BASE_URL}/api/diary/{entry_id}")
        assert r4.status_code == 200
        r5 = api.get(f"{BASE_URL}/api/diary", params={"date": TODAY})
        found2 = any(e["id"] == entry_id for e in r5.json()["meals"]["almoco"]["entries"])
        assert not found2

    def test_copy_day(self, api):
        payload = {
            "date": YESTERDAY, "meal": "cafe_manha", "name": "TEST_Copy",
            "grams": 100, "calories": 100, "protein": 5, "carbs": 10, "fat": 2,
        }
        r = api.post(f"{BASE_URL}/api/diary", json=payload)
        assert r.status_code == 200
        src_id = r.json()["id"]

        r2 = api.post(f"{BASE_URL}/api/diary/copy", json={"from_date": YESTERDAY, "to_date": TODAY, "meal": "cafe_manha"})
        assert r2.status_code == 200
        assert r2.json()["copied"] >= 1

        # cleanup
        api.delete(f"{BASE_URL}/api/diary/{src_id}")


# --- Water ------------------------------------------------------------
class TestWater:
    def test_add_and_get_water(self, api):
        r0 = api.get(f"{BASE_URL}/api/water", params={"date": TODAY})
        before = r0.json().get("total_ml", 0)
        r = api.post(f"{BASE_URL}/api/water", json={"date": TODAY, "amount_ml": 250})
        assert r.status_code == 200, r.text
        r2 = api.get(f"{BASE_URL}/api/water", params={"date": TODAY})
        d = r2.json()
        assert d["total_ml"] == before + 250
        assert d["goal_ml"] > 0


# --- Weight -----------------------------------------------------------
class TestWeight:
    def test_add_and_list(self, api):
        today_d = date.today().isoformat()
        r = api.post(f"{BASE_URL}/api/weight", json={"weight_kg": 77.5, "date": today_d})
        assert r.status_code == 200, r.text
        r2 = api.get(f"{BASE_URL}/api/weight")
        assert r2.status_code == 200
        results = r2.json()["results"]
        assert any(w["date"] == today_d and abs(w["weight_kg"] - 77.5) < 0.01 for w in results)


# --- Workouts & Athlete Mode -----------------------------------------
class TestWorkouts:
    def test_workout_affects_target_in_athlete_mode(self, api):
        # Ensure athlete mode ON
        p0 = api.get(f"{BASE_URL}/api/profile").json()
        orig_athlete = bool(p0.get("athlete_mode"))
        api.put(f"{BASE_URL}/api/profile", json={"athlete_mode": True})

        p = api.get(f"{BASE_URL}/api/profile").json()
        assert p["goals"]["athlete_mode"] is True

        d0 = api.get(f"{BASE_URL}/api/diary", params={"date": TODAY}).json()
        base_target = d0["target_calories"]
        base_goal = d0["goals"]["calories"]
        # In athlete mode, with no workouts, target == goal
        base_workout = d0["workout_calories"]
        assert base_target == base_goal + base_workout

        r = api.post(f"{BASE_URL}/api/workouts", json={
            "date": TODAY, "type": "corrida", "duration_min": 30, "calories": 300,
        })
        assert r.status_code == 200, r.text
        w_id = r.json()["id"]

        d1 = api.get(f"{BASE_URL}/api/diary", params={"date": TODAY}).json()
        assert d1["workout_calories"] == base_workout + 300
        assert d1["target_calories"] == base_goal + base_workout + 300

        # list workouts
        rl = api.get(f"{BASE_URL}/api/workouts", params={"date": TODAY})
        assert rl.status_code == 200
        assert any(w["id"] == w_id for w in rl.json()["results"])

        # Validate base goal uses sedentary (1.2) multiplier
        # bmr * 1.2 * (1 + goal_adjust) should equal goals.calories
        # Just sanity: TDEE = bmr * 1.2 in athlete mode
        g = p["goals"]
        assert abs(g["tdee"] - round(g["bmr"] * 1.2)) <= 1

        # cleanup
        api.delete(f"{BASE_URL}/api/workouts/{w_id}")
        if not orig_athlete:
            api.put(f"{BASE_URL}/api/profile", json={"athlete_mode": False})


# --- Reports ----------------------------------------------------------
class TestReports:
    def test_reports_week(self, api):
        r = api.get(f"{BASE_URL}/api/reports", params={"period": "week"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["period"] == "week"
        assert len(d["daily"]) == 7
        assert "averages" in d and "goals" in d and "weights" in d


# --- AI recognize -----------------------------------------------------
def _real_food_jpeg_b64() -> str:
    """Return a small base64 jpeg of real-looking food.
    Fetch from a public URL; fall back to a tiny generated image if network fails.
    """
    try:
        resp = requests.get(
            "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=512&q=80",
            timeout=15,
        )
        if resp.status_code == 200 and len(resp.content) > 2000:
            return base64.b64encode(resp.content).decode()
    except Exception:
        pass
    # fallback: a photo-ish image generated with PIL (not a solid color)
    try:
        from PIL import Image, ImageDraw
        import random
        im = Image.new("RGB", (256, 256), (200, 150, 100))
        d = ImageDraw.Draw(im)
        random.seed(1)
        for _ in range(400):
            x = random.randint(0, 255); y = random.randint(0, 255)
            r_ = random.randint(5, 30)
            c = (random.randint(100, 255), random.randint(50, 180), random.randint(30, 120))
            d.ellipse((x - r_, y - r_, x + r_, y + r_), fill=c)
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=80)
        return base64.b64encode(buf.getvalue()).decode()
    except Exception:
        pytest.skip("Cannot build test image")


class TestAIRecognize:
    def test_recognize_food_returns_shape(self, api):
        img_b64 = _real_food_jpeg_b64()
        r = api.post(f"{BASE_URL}/api/ai/recognize", json={"image_base64": img_b64}, timeout=90)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        d = r.json()
        assert "foods" in d
        assert "note" in d
        assert isinstance(d["foods"], list)
        if d["foods"]:
            for key in ("name", "grams", "calories", "protein", "carbs", "fat"):
                assert key in d["foods"][0]
