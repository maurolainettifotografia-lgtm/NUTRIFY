"""Testes offline da base TACO (nao precisam de servidor nem de banco)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import taco_foods as T  # noqa: E402

OFFICIAL = [f for f in T.TACO_FOODS if f["brand"] == "TACO"]


def test_tem_os_597_alimentos_oficiais():
    assert len(OFFICIAL) == 597
    ids = sorted(int(f["code"].split("-")[1]) for f in OFFICIAL)
    assert ids == list(range(1, 598))


def test_valores_conferidos_com_o_pdf():
    f = T.find_taco("Arroz, integral, cozido")
    assert (f["calories"], f["protein"], f["fat"], f["carbs"], f["fiber"], f["sodium"]) == (124, 2.6, 1.0, 25.8, 2.7, 1)
    f = T.find_taco("Biscoito, doce, maisena")
    assert (f["calories"], f["sodium"]) == (443, 352)
    f = T.find_taco("noz, crua")  # sem acento/maiuscula tambem acha
    assert (f["calories"], f["fat"]) == (620, 59.4)


def test_calorias_batem_com_macros():
    # kcal ~ 4*(prot+carbo) + 9*gordura. So alimentos com muita fibra/alcool/agua fogem disso.
    ruins = [f["name"] for f in OFFICIAL
             if f["calories"] > 20 and abs(4 * (f["protein"] + f["carbs"]) + 9 * f["fat"] - f["calories"]) / f["calories"] > 0.25]
    assert len(ruins) <= 12, ruins


def test_nenhum_valor_absurdo():
    for f in T.TACO_FOODS:
        assert 0 <= f["calories"] <= 1000 and 0 <= f["protein"] <= 100 and 0 <= f["carbs"] <= 100
        assert 0 <= f["fat"] <= 100 and 0 <= f["fiber"] <= 100 and 0 <= f["sodium"] <= 40000, f["name"]


def test_busca_apelidos_e_artigos():
    assert T.search_taco("arroz branco")[0]["name"] == "Arroz, tipo 1, cozido"
    assert any("forma" in x["name"].lower() for x in T.search_taco("pão de forma"))
    assert any("peito" in x["name"].lower() for x in T.search_taco("peito de frango"))
    assert "Queijo, mozarela" in [x["name"] for x in T.search_taco("mussarela")]
    assert T.search_taco("") == [] and T.search_taco("zzzzzz") == []


def test_taco_vem_antes_dos_extras():
    r = T.search_taco("frango")
    assert r[0]["brand"] == "TACO"
    r = T.search_taco("amendoim", limit=50)
    brands = [x["brand"] for x in r]
    assert brands == sorted(brands, key=lambda b: b != "TACO")


def test_lista_da_ia_sem_carne_crua_nem_alcool():
    names = " | ".join(T.TACO_NAMES).lower()
    assert "aguardente" not in names and "cerveja" not in names
    assert "Carne, bovina, patinho, sem gordura, cru" not in T.TACO_NAMES
    assert "Carne, bovina, patinho, sem gordura, grelhado" in T.TACO_NAMES
    assert "Banana, prata, crua" in T.TACO_NAMES  # fruta crua pode
    assert T.find_taco("Carne, bovina, patinho, sem gordura, cru")  # mas ainda e encontravel
    assert len(", ".join(T.TACO_NAMES)) < 22000


def test_campos_esperados_pelo_servidor():
    for f in T.search_taco("feijao"):
        assert {"source", "code", "name", "brand", "calories", "protein", "carbs", "fat", "fiber", "sugars", "sodium"} <= set(f)
        assert not any(k.startswith("_") for k in f)
