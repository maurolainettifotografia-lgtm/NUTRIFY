"""Tests covering the new features for this iteration:
- Brazilian TACO foods appear first on /api/foods/search
- Non-onboarded user can PUT /api/profile with birth_date -> onboarded + goals
- AI chat endpoints: history list, stream (SSE), clear
"""
import os
import re
import json
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://nutrify-app.preview.emergentagent.com").rstrip("/")
TOKEN = "test-token-nutrify-123"
NEW_TOKEN = "test-token-new-456"
H = {"Authorization": f"Bearer {TOKEN}"}
HN = {"Authorization": f"Bearer {NEW_TOKEN}"}


# ---------------- Brazilian foods (TACO) ----------------
class TestBrazilianFoods:
    def test_feijao_returns_taco_first(self):
        r = requests.get(f"{BASE_URL}/api/foods/search", params={"q": "feijao"}, headers=H, timeout=30)
        assert r.status_code == 200, r.text
        items = r.json()["results"]
        assert len(items) >= 1
        assert items[0]["source"] == "taco"
        assert items[0]["brand"] == "TACO"
        # accent-insensitive: "feijao" should match "Feijão"
        names = " ".join(x["name"].lower() for x in items[:5])
        assert "feij" in names

    def test_frango_returns_taco_first(self):
        r = requests.get(f"{BASE_URL}/api/foods/search", params={"q": "frango"}, headers=H, timeout=30)
        assert r.status_code == 200
        items = r.json()["results"]
        assert items[0]["source"] == "taco"
        # Peito de frango should be in results
        taco_names = [x["name"] for x in items if x["source"] == "taco"]
        assert any("frango" in n.lower() for n in taco_names)

    def test_arroz_branco_found(self):
        r = requests.get(f"{BASE_URL}/api/foods/search", params={"q": "arroz"}, headers=H, timeout=30)
        assert r.status_code == 200
        items = r.json()["results"]
        assert any(x["name"] == "Arroz branco cozido" and x["source"] == "taco" for x in items)


# ---------------- Onboarding profile for non-onboarded user ----------------
class TestOnboardingBirthDate:
    def test_non_onboarded_me(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=HN, timeout=15)
        assert r.status_code == 200
        assert r.json()["onboarded"] is False

    def test_put_profile_saves_birth_and_goals(self):
        payload = {
            "name": "Novo Usuário",
            "sex": "male",
            "birth_date": "1995-05-20",
            "height_cm": 180,
            "weight_kg": 82,
            "goal_weight_kg": 77,
            "activity_level": "moderate",
            "goal": "emagrecimento",
        }
        r = requests.put(f"{BASE_URL}/api/profile", json=payload, headers=HN, timeout=15)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["onboarded"] is True
        assert p["birth_date"] == "1995-05-20"
        assert "goals" in p
        g = p["goals"]
        assert g["calories"] > 0 and g["protein"] > 0 and g["carbs"] > 0 and g["fat"] > 0
        # Verify persistence
        r2 = requests.get(f"{BASE_URL}/api/profile", headers=HN, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["birth_date"] == "1995-05-20"


# ---------------- Chat ----------------
class TestChat:
    @classmethod
    def teardown_class(cls):
        requests.delete(f"{BASE_URL}/api/chat/messages", headers=H, timeout=15)

    def test_get_messages_initially(self):
        requests.delete(f"{BASE_URL}/api/chat/messages", headers=H, timeout=15)
        r = requests.get(f"{BASE_URL}/api/chat/messages", headers=H, timeout=15)
        assert r.status_code == 200
        assert r.json() == {"messages": []}

    def test_delete_requires_auth(self):
        r = requests.delete(f"{BASE_URL}/api/chat/messages", timeout=15)
        assert r.status_code == 401

    def test_stream_rejects_empty(self):
        r = requests.post(f"{BASE_URL}/api/chat/stream", json={"message": "  "}, headers=H, timeout=15)
        assert r.status_code == 400

    def test_stream_returns_sse_and_persists(self):
        requests.delete(f"{BASE_URL}/api/chat/messages", headers=H, timeout=15)
        payload = {"message": "Oi Nutri, responda em uma frase curta: qual é minha meta de calorias?", "date": "2026-01-15"}
        with requests.post(
            f"{BASE_URL}/api/chat/stream", json=payload, headers=H, stream=True, timeout=60
        ) as r:
            assert r.status_code == 200
            ctype = r.headers.get("content-type", "")
            assert "text/event-stream" in ctype
            deltas = []
            done = False
            for line in r.iter_lines(decode_unicode=True):
                if not line:
                    continue
                assert line.startswith("data: "), line
                evt = json.loads(line[6:])
                if "delta" in evt:
                    deltas.append(evt["delta"])
                elif evt.get("done"):
                    done = True
                    break
                elif evt.get("error"):
                    pytest.skip(f"LLM error: {evt['error']}")
            assert done
            assert len(deltas) >= 1
            full = "".join(deltas).strip()
            assert len(full) > 0

        # history now has user + assistant
        r2 = requests.get(f"{BASE_URL}/api/chat/messages", headers=H, timeout=15)
        assert r2.status_code == 200
        msgs = r2.json()["messages"]
        assert len(msgs) >= 2
        roles = [m["role"] for m in msgs[-2:]]
        assert roles == ["user", "assistant"]

    def test_clear_messages(self):
        r = requests.delete(f"{BASE_URL}/api/chat/messages", headers=H, timeout=15)
        assert r.status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/chat/messages", headers=H, timeout=15)
        assert r2.json()["messages"] == []
