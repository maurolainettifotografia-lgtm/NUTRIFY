"""Tests for new features: AI meal suggestions + OFF barcode lookup."""
import os
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://nutrify-app.preview.emergentagent.com").rstrip("/")
TOKEN = "test-token-nutrify-123"
H = {"Authorization": f"Bearer {TOKEN}"}


# ---------------- Barcode lookup (OpenFoodFacts) ----------------
class TestBarcode:
    def test_known_barcode_returns_product(self):
        r = requests.get(f"{BASE_URL}/api/foods/barcode/7891000100103", headers=H, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["code"] == "7891000100103"
        # Portuguese "Moça" (condensed milk)
        assert "moça" in data["name"].lower() or "moca" in data["name"].lower() or "condensado" in data["name"].lower()
        assert data["source"] == "off"
        assert data["calories"] > 0
        # macros should be present and numeric
        for k in ("protein", "carbs", "fat"):
            assert isinstance(data.get(k), (int, float))

    def test_unknown_barcode_404(self):
        r = requests.get(f"{BASE_URL}/api/foods/barcode/0000000000000", headers=H, timeout=30)
        assert r.status_code == 404

    def test_barcode_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/foods/barcode/7891000100103", timeout=30)
        assert r.status_code == 401


# ---------------- AI meal suggestions ----------------
TACO_NAME_LOWER_HINTS = None


def _load_taco_names():
    global TACO_NAME_LOWER_HINTS
    if TACO_NAME_LOWER_HINTS is not None:
        return TACO_NAME_LOWER_HINTS
    # read taco_foods.py and extract names via import
    import importlib.util, pathlib
    p = pathlib.Path(__file__).resolve().parents[1] / "taco_foods.py"
    spec = importlib.util.spec_from_file_location("taco_foods", p)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore
    names = [f["name"].lower() for f in mod.TACO_FOODS]
    TACO_NAME_LOWER_HINTS = set(names)
    return TACO_NAME_LOWER_HINTS


class TestMealSuggestions:
    def test_suggestions_shape(self):
        payload = {"meal": "jantar", "date": "2026-01-15"}
        r = requests.post(f"{BASE_URL}/api/ai/meal-suggestions", json=payload, headers=H, timeout=90)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["meal"] == "jantar"
        rem = data["remaining"]
        for k in ("calories", "protein", "carbs", "fat"):
            assert k in rem
            assert isinstance(rem[k], (int, float))
            assert rem[k] >= 0

        suggestions = data["suggestions"]
        assert isinstance(suggestions, list)
        assert len(suggestions) >= 1  # ideally 3; at least 1

        taco_names = _load_taco_names()
        for s in suggestions:
            assert "id" in s and "title" in s and "items" in s and "totals" in s
            assert isinstance(s["items"], list) and len(s["items"]) >= 1
            for it in s["items"]:
                # Must be TACO food only
                assert it["source"] == "taco", f"non-taco item: {it}"
                assert it["name"].lower() in taco_names, f"not in TACO list: {it['name']}"
                # per 100g macros present and computed shown
                for k in ("calories", "protein", "carbs", "fat"):
                    assert k in it
                assert "computed" in it
                for k in ("calories", "protein", "carbs", "fat"):
                    assert k in it["computed"]
                assert "grams" in it and it["grams"] > 0
                assert "code" in it
            # totals numeric
            for k in ("calories", "protein", "carbs", "fat"):
                assert isinstance(s["totals"][k], (int, float))

    def test_suggestions_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/ai/meal-suggestions", json={"meal": "jantar"}, timeout=30)
        assert r.status_code == 401
