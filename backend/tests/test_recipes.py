"""Tests for Receitas Caseiras (/api/recipes) CRUD + validation + isolation."""
import os
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
TOKEN = "test-token-nutrify-123"
OTHER_TOKEN = "test-token-new-456"
H = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
H_OTHER = {"Authorization": f"Bearer {OTHER_TOKEN}", "Content-Type": "application/json"}


def _recipe_payload(name="TEST_Bolo de banana"):
    return {
        "name": name,
        "servings": 4,
        "ingredients": [
            {"name": "Farinha de trigo", "grams": 200, "calories": 364, "protein": 10, "carbs": 76, "fat": 1, "fiber": 2.7, "source": "taco"},
            {"name": "Banana nanica", "grams": 300, "calories": 92, "protein": 1.4, "carbs": 23.8, "fat": 0.1, "fiber": 2, "source": "taco"},
            {"name": "Açúcar refinado", "grams": 100, "calories": 387, "protein": 0, "carbs": 100, "fat": 0, "fiber": 0, "source": "taco"},
        ],
    }


class TestRecipeCRUD:
    created_ids = []

    def test_create_recipe_shape(self):
        r = requests.post(f"{BASE_URL}/api/recipes", json=_recipe_payload(), headers=H)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["source"] == "recipe"
        assert d["name"] == "TEST_Bolo de banana"
        assert d["servings"] == 4
        # total_grams = 600, serving_grams = 150
        assert d["total_grams"] == 600
        assert d["serving_grams"] == 150
        assert d["serving"] == "1 porção (150 g)"
        # totals
        totals = d["totals"]
        # expected cal totals: 364*2 + 92*3 + 387*1 = 728 + 276 + 387 = 1391
        assert abs(totals["calories"] - 1391.0) < 1.5
        # per-100g calories
        # 1391 / 600 * 100 ≈ 231.8
        assert abs(d["calories"] - round(1391 / 600 * 100, 1)) < 0.5
        assert "protein" in d and "carbs" in d and "fat" in d
        assert d.get("id")
        TestRecipeCRUD.created_ids.append(d["id"])

    def test_list_recipes_contains_created(self):
        r = requests.get(f"{BASE_URL}/api/recipes", headers=H)
        assert r.status_code == 200
        results = r.json()["results"]
        ids = [x["id"] for x in results]
        assert TestRecipeCRUD.created_ids[0] in ids
        found = next(x for x in results if x["id"] == TestRecipeCRUD.created_ids[0])
        assert found["source"] == "recipe"
        assert found["serving_grams"] == 150

    def test_get_single_recipe(self):
        rid = TestRecipeCRUD.created_ids[0]
        r = requests.get(f"{BASE_URL}/api/recipes/{rid}", headers=H)
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == rid
        assert d["source"] == "recipe"
        assert len(d["ingredients"]) == 3

    def test_update_recipe(self):
        rid = TestRecipeCRUD.created_ids[0]
        payload = _recipe_payload(name="TEST_Bolo de banana v2")
        payload["servings"] = 8  # halves per-serving values
        r = requests.put(f"{BASE_URL}/api/recipes/{rid}", json=payload, headers=H)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == "TEST_Bolo de banana v2"
        assert d["servings"] == 8
        assert d["serving_grams"] == 75  # 600/8
        # verify persisted via GET
        g = requests.get(f"{BASE_URL}/api/recipes/{rid}", headers=H).json()
        assert g["name"] == "TEST_Bolo de banana v2"
        assert g["servings"] == 8

    def test_update_nonexistent(self):
        r = requests.put(f"{BASE_URL}/api/recipes/does-not-exist", json=_recipe_payload(), headers=H)
        assert r.status_code == 404

    def test_delete_soft_deletes(self):
        rid = TestRecipeCRUD.created_ids[0]
        r = requests.delete(f"{BASE_URL}/api/recipes/{rid}", headers=H)
        assert r.status_code == 200
        # should 404 on GET now
        g = requests.get(f"{BASE_URL}/api/recipes/{rid}", headers=H)
        assert g.status_code == 404
        # should be absent from list
        lst = requests.get(f"{BASE_URL}/api/recipes", headers=H).json()["results"]
        assert rid not in [x["id"] for x in lst]


class TestRecipeValidation:
    def test_empty_ingredients_rejected(self):
        payload = {"name": "TEST_vazio", "servings": 1, "ingredients": []}
        r = requests.post(f"{BASE_URL}/api/recipes", json=payload, headers=H)
        assert r.status_code == 400

    def test_short_name_rejected(self):
        payload = _recipe_payload(name="a")
        r = requests.post(f"{BASE_URL}/api/recipes", json=payload, headers=H)
        assert r.status_code == 400

    def test_zero_grams_ingredients_rejected(self):
        payload = _recipe_payload()
        for ing in payload["ingredients"]:
            ing["grams"] = 0
        r = requests.post(f"{BASE_URL}/api/recipes", json=payload, headers=H)
        assert r.status_code == 400

    def test_zero_servings_rejected(self):
        payload = _recipe_payload()
        payload["servings"] = 0
        r = requests.post(f"{BASE_URL}/api/recipes", json=payload, headers=H)
        assert r.status_code == 400


class TestRecipeIsolation:
    """Other user cannot access."""
    rid = None

    def test_setup_create(self):
        r = requests.post(f"{BASE_URL}/api/recipes", json=_recipe_payload(name="TEST_iso recipe"), headers=H)
        assert r.status_code == 200
        TestRecipeIsolation.rid = r.json()["id"]

    def test_other_user_cannot_get(self):
        rid = TestRecipeIsolation.rid
        r = requests.get(f"{BASE_URL}/api/recipes/{rid}", headers=H_OTHER)
        assert r.status_code == 404

    def test_other_user_cannot_update(self):
        rid = TestRecipeIsolation.rid
        r = requests.put(f"{BASE_URL}/api/recipes/{rid}", json=_recipe_payload(), headers=H_OTHER)
        assert r.status_code == 404

    def test_other_user_list_excludes(self):
        rid = TestRecipeIsolation.rid
        r = requests.get(f"{BASE_URL}/api/recipes", headers=H_OTHER)
        assert r.status_code == 200
        assert rid not in [x["id"] for x in r.json()["results"]]

    def test_cleanup(self):
        requests.delete(f"{BASE_URL}/api/recipes/{TestRecipeIsolation.rid}", headers=H)


class TestRecipeDiaryIntegration:
    """Log a recipe into the diary at per-100g values × grams."""

    def test_log_recipe_in_diary(self):
        # create recipe
        payload = _recipe_payload(name="TEST_log recipe")
        create = requests.post(f"{BASE_URL}/api/recipes", json=payload, headers=H).json()
        rid = create["id"]
        per100_kcal = create["calories"]
        serving_g = create["serving_grams"]

        # log 1 porção in diary today
        from datetime import date as dcls
        today = dcls.today().isoformat()
        diary_body = {
            "date": today,
            "meal": "almoco",
            "name": create["name"],
            "grams": serving_g,
            "calories": per100_kcal,
            "protein": create["protein"],
            "carbs": create["carbs"],
            "fat": create["fat"],
            "source": "recipe",
        }
        add = requests.post(f"{BASE_URL}/api/diary", json=diary_body, headers=H)
        assert add.status_code == 200, add.text
        entry_id = add.json()["id"]

        # verify in diary
        d = requests.get(f"{BASE_URL}/api/diary", params={"date": today}, headers=H).json()
        found = None
        for m in d["meals"].values():
            for e in m["entries"]:
                if e["id"] == entry_id:
                    found = e
                    break
        assert found is not None, "diary entry not persisted"
        expected = round(per100_kcal * serving_g / 100, 1)
        assert abs(found["computed"]["calories"] - expected) < 0.5
        assert found["source"] == "recipe"

        # cleanup
        requests.delete(f"{BASE_URL}/api/diary/{entry_id}", headers=H)
        requests.delete(f"{BASE_URL}/api/recipes/{rid}", headers=H)
