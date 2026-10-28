"""Base de alimentos brasileiros do app.

Fonte principal: TACO - Tabela Brasileira de Composicao de Alimentos, 4a edicao ampliada e
revisada (NEPA/UNICAMP, 2011): 597 alimentos, valores por 100 g de parte comestivel.
Os dados ficam em taco_data.json (gerado por scripts/extract_taco.py a partir do PDF oficial).
"Tr" (traco) e "NA" (nao analisado) da tabela original viram 0.

Alem da TACO, ha poucos itens comuns que ela nao traz (whey, granola, iogurte grego...).
Eles aparecem depois dos itens da TACO e com a marca "Referencia comum" (valores aproximados).
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path


def _norm(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")


# Itens populares que NAO existem na TACO: (nome, kcal, proteina, carbo, gordura, fibra) por 100 g.
_EXTRA = [
    ("Tapioca (goma hidratada)", 240, 0.0, 60.0, 0.0, 0.0),
    ("Purê de batata", 89, 2.0, 13.0, 3.3, 1.2),
    ("Macarrão cozido", 158, 5.8, 30.9, 0.9, 1.8),
    ("Polenta cozida", 70, 1.6, 15.0, 0.3, 1.0),
    ("Omelete simples", 154, 10.6, 0.6, 12.0, 0.0),
    ("Linguiça calabresa", 320, 16.0, 2.0, 27.0, 0.0),
    ("Bacon frito", 541, 37.0, 1.4, 42.0, 0.0),
    ("Peito de peru", 108, 19.0, 2.0, 2.5, 0.0),
    ("Salsicha", 257, 12.0, 3.0, 22.0, 0.0),
    ("Tilápia grelhada", 128, 26.0, 0.0, 2.7, 0.0),
    ("Atum em lata (água)", 116, 26.0, 0.0, 1.0, 0.0),
    ("Iogurte grego", 120, 5.0, 14.0, 5.0, 0.0),
    ("Grão de bico cozido", 164, 8.9, 27.4, 2.6, 7.6),
    ("Granola", 420, 10.0, 64.0, 14.0, 7.0),
    ("Pasta de amendoim", 588, 25.0, 20.0, 50.0, 6.0),
    ("Pizza de muçarela", 286, 12.0, 32.0, 12.0, 2.0),
    ("Whey protein concentrado", 400, 80.0, 8.0, 6.0, 0.0),
]

# Apelidos populares que nao aparecem no nome oficial (so afetam a busca).
_ALIASES = {
    "Arroz, tipo 1, cozido": "arroz branco",
    "Arroz, tipo 1, cru": "arroz branco",
    "Pão, trigo, francês": "paozinho pao de sal",
    "Queijo, mozarela": "mussarela muçarela",
    "Mandioca, cozida": "aipim macaxeira",
    "Mandioca, crua": "aipim macaxeira",
    "Refrigerante, tipo cola": "coca cola",
    "Mamão, Papaia, cru": "mamao papaya",
    "Café, infusão 10%": "cafe coado",
    "Tomate, com semente, cru": "tomate",
}

_STOPWORDS = {"de", "da", "do", "das", "dos", "com", "em", "e", "a", "o"}

_DATA = json.loads((Path(__file__).with_name("taco_data.json")).read_text(encoding="utf-8"))


def _entry(code, name, brand, kcal, p, c, f, fib, sodium=0.0, alias=""):
    return {
        "source": "taco",
        "code": code,
        "name": name,
        "brand": brand,
        "calories": kcal,
        "protein": p,
        "carbs": c,
        "fat": f,
        "fiber": fib,
        "sugars": 0,
        "sodium": sodium,
        "_n": _norm(name + " " + alias),
        "_extra": brand != "TACO",
        "_cat": "",
    }


TACO_FOODS = []
for _d in _DATA:
    _e = _entry(f"taco-{_d['id']}", _d["name"], "TACO", _d["calories"], _d["protein"], _d["carbs"],
                _d["fat"], _d["fiber"], _d["sodium"], _ALIASES.get(_d["name"], ""))
    _e["_cat"] = _d.get("category") or ""
    TACO_FOODS.append(_e)
for _i, (_name, _k, _p, _c, _f, _fib) in enumerate(_EXTRA):
    TACO_FOODS.append(_entry(f"ref-{_i}", _name, "Referência comum", _k, _p, _c, _f, _fib))

# find_taco procura pelo nome exato (sem acento/maiuscula), so no nome oficial.
TACO_BY_NORM = {_norm(f["name"]): f for f in TACO_FOODS}

# Lista de nomes entregue a IA nas sugestoes de refeicao. Fica de fora o que ninguem comeria
# como refeicao (carne/peixe crus, bebidas alcoolicas), para a IA nao sugerir isso.
_RAW_WORD = re.compile(r"\b(cru|crua|crus|cruas)\b")
_ALCOHOL = re.compile(r"aguardente|cerveja|vinho|cachaca|pinga")


def _good_for_meal(f) -> bool:
    n = _norm(f["name"])
    if _ALCOHOL.search(n):
        return False
    if f["_cat"].startswith(("Carnes", "Pescados")) and _RAW_WORD.search(n):
        return False
    return True


TACO_NAMES = [f["name"] for f in TACO_FOODS if _good_for_meal(f)]


def _public(f):
    return {k: v for k, v in f.items() if not k.startswith("_")}


def find_taco(name: str):
    f = TACO_BY_NORM.get(_norm(name.strip()))
    return _public(f) if f else None


def search_taco(q: str, limit: int = 15):
    tokens = _norm(q).split()
    # "pao de forma" -> pao + forma (artigos/preposicoes nao existem no nome oficial)
    meaningful = [t for t in tokens if t not in _STOPWORDS]
    tokens = meaningful or tokens
    if not tokens:
        return []
    hits = [f for f in TACO_FOODS if all(t in f["_n"] for t in tokens)]
    wants_raw = any(t in ("cru", "crua", "crus", "cruas") for t in tokens)
    # ordem: itens da TACO antes dos extras; comecam com a busca; prontos para comer antes dos
    # crus (a pessoa registra o que comeu), a nao ser que ela busque "cru"; depois os mais curtos
    hits.sort(key=lambda f: (
        f["_extra"],
        not f["_n"].startswith(tokens[0]),
        (not wants_raw) and bool(_RAW_WORD.search(f["_n"])),
        len(f["name"]),
    ))
    return [_public(f) for f in hits[:limit]]
