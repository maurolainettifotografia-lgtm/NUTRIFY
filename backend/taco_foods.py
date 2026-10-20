"""Common Brazilian foods (values per 100 g), based on TACO (Tabela Brasileira de
Composição de Alimentos – UNICAMP). Searched first so everyday Brazilian
foods appear before packaged Open Food Facts products."""
import unicodedata

# name, kcal, protein, carbs, fat, fiber
_RAW = [
    ("Arroz branco cozido", 128, 2.5, 28.1, 0.2, 1.6),
    ("Arroz integral cozido", 124, 2.6, 25.8, 1.0, 2.7),
    ("Feijão carioca cozido", 76, 4.8, 13.6, 0.5, 8.5),
    ("Feijão preto cozido", 77, 4.5, 14.0, 0.5, 8.4),
    ("Feijoada", 117, 8.7, 11.6, 6.5, 5.1),
    ("Farofa de mandioca", 406, 2.1, 80.3, 9.1, 7.8),
    ("Farinha de mandioca torrada", 365, 1.2, 89.2, 0.3, 6.5),
    ("Pão francês", 300, 8.0, 58.6, 3.1, 2.3),
    ("Pão de forma", 253, 12.0, 44.1, 2.7, 2.5),
    ("Pão de forma integral", 253, 9.4, 49.9, 3.7, 6.9),
    ("Pão de queijo", 363, 5.1, 34.2, 24.6, 0.6),
    ("Tapioca (goma hidratada)", 240, 0.0, 60.0, 0.0, 0.0),
    ("Cuscuz de milho cozido", 113, 2.2, 25.3, 0.7, 2.1),
    ("Mandioca cozida", 125, 0.6, 30.1, 0.3, 1.6),
    ("Batata inglesa cozida", 52, 1.2, 11.9, 0.0, 1.3),
    ("Batata doce cozida", 77, 0.6, 18.4, 0.1, 2.2),
    ("Batata frita", 267, 5.0, 35.6, 13.1, 8.1),
    ("Purê de batata", 89, 2.0, 13.0, 3.3, 1.2),
    ("Macarrão cozido", 158, 5.8, 30.9, 0.9, 1.8),
    ("Polenta cozida", 70, 1.6, 15.0, 0.3, 1.0),
    ("Ovo de galinha cozido", 146, 13.3, 0.6, 9.5, 0.0),
    ("Ovo de galinha frito", 240, 15.6, 1.2, 18.6, 0.0),
    ("Omelete simples", 154, 10.6, 0.6, 12.0, 0.0),
    ("Peito de frango grelhado", 159, 32.0, 0.0, 2.5, 0.0),
    ("Coxa de frango assada", 215, 28.0, 0.0, 11.0, 0.0),
    ("Frango desfiado cozido", 163, 31.5, 0.0, 3.2, 0.0),
    ("Carne bovina patinho grelhado", 219, 35.9, 0.0, 7.3, 0.0),
    ("Carne bovina alcatra grelhada", 241, 31.9, 0.0, 11.6, 0.0),
    ("Carne bovina picanha grelhada", 289, 26.4, 0.0, 19.5, 0.0),
    ("Carne bovina contrafilé grelhado", 278, 32.4, 0.0, 15.5, 0.0),
    ("Carne moída refogada", 212, 26.7, 0.0, 10.9, 0.0),
    ("Costela bovina assada", 373, 28.8, 0.0, 27.7, 0.0),
    ("Carne de porco lombo assado", 210, 35.7, 0.0, 6.4, 0.0),
    ("Linguiça toscana grelhada", 296, 23.2, 0.0, 21.0, 0.0),
    ("Linguiça calabresa", 320, 16.0, 2.0, 27.0, 0.0),
    ("Bacon frito", 541, 37.0, 1.4, 42.0, 0.0),
    ("Presunto", 94, 14.3, 2.1, 2.7, 0.0),
    ("Peito de peru", 108, 19.0, 2.0, 2.5, 0.0),
    ("Mortadela", 269, 12.0, 5.8, 21.6, 0.0),
    ("Salsicha", 257, 12.0, 3.0, 22.0, 0.0),
    ("Hambúrguer bovino grelhado", 210, 13.2, 11.3, 12.4, 0.0),
    ("Tilápia grelhada", 128, 26.0, 0.0, 2.7, 0.0),
    ("Salmão grelhado", 229, 23.9, 0.0, 14.0, 0.0),
    ("Sardinha em lata (óleo)", 285, 15.9, 0.0, 24.0, 0.0),
    ("Atum em lata (água)", 116, 26.0, 0.0, 1.0, 0.0),
    ("Camarão cozido", 90, 19.0, 0.0, 1.0, 0.0),
    ("Strogonoff de frango", 157, 17.6, 3.0, 8.0, 0.3),
    ("Strogonoff de carne", 173, 15.0, 3.0, 11.0, 0.3),
    ("Queijo minas frescal", 264, 17.4, 3.2, 20.2, 0.0),
    ("Queijo muçarela", 330, 22.6, 3.0, 25.2, 0.0),
    ("Queijo prato", 360, 22.7, 1.9, 29.1, 0.0),
    ("Queijo parmesão", 453, 35.6, 1.7, 33.5, 0.0),
    ("Requeijão cremoso", 257, 9.6, 2.4, 23.4, 0.0),
    ("Leite integral", 61, 3.2, 4.7, 3.3, 0.0),
    ("Leite desnatado", 35, 3.4, 4.9, 0.2, 0.0),
    ("Iogurte natural", 51, 4.1, 1.9, 3.0, 0.0),
    ("Iogurte grego", 120, 5.0, 14.0, 5.0, 0.0),
    ("Manteiga", 726, 0.4, 0.1, 82.4, 0.0),
    ("Margarina", 596, 0.0, 0.0, 67.4, 0.0),
    ("Azeite de oliva", 884, 0.0, 0.0, 100.0, 0.0),
    ("Óleo de soja", 884, 0.0, 0.0, 100.0, 0.0),
    ("Açúcar refinado", 387, 0.3, 99.5, 0.0, 0.0),
    ("Mel", 309, 0.0, 84.0, 0.0, 0.0),
    ("Doce de leite", 306, 5.5, 59.5, 6.0, 0.0),
    ("Café coado (sem açúcar)", 9, 0.7, 1.5, 0.1, 0.0),
    ("Suco de laranja natural", 33, 0.7, 7.6, 0.1, 0.0),
    ("Refrigerante de cola", 42, 0.0, 10.6, 0.0, 0.0),
    ("Cerveja", 41, 0.3, 3.3, 0.0, 0.0),
    ("Água de coco", 22, 0.0, 5.3, 0.0, 0.1),
    ("Banana prata", 98, 1.3, 26.0, 0.1, 2.0),
    ("Banana nanica", 92, 1.4, 23.8, 0.1, 1.9),
    ("Maçã", 56, 0.3, 15.2, 0.0, 1.3),
    ("Mamão papaia", 40, 0.5, 10.4, 0.1, 1.0),
    ("Laranja pera", 37, 1.0, 8.9, 0.1, 0.8),
    ("Manga", 72, 0.4, 19.4, 0.2, 1.6),
    ("Abacaxi", 48, 0.9, 12.3, 0.1, 1.0),
    ("Melancia", 33, 0.9, 8.1, 0.0, 0.1),
    ("Melão", 29, 0.7, 7.5, 0.0, 0.3),
    ("Morango", 30, 0.9, 6.8, 0.3, 1.7),
    ("Uva", 53, 0.7, 13.6, 0.2, 0.9),
    ("Abacate", 96, 1.2, 6.0, 8.4, 6.3),
    ("Goiaba", 54, 1.1, 13.0, 0.4, 6.2),
    ("Maracujá", 68, 2.0, 12.3, 2.1, 1.1),
    ("Açaí (polpa com xarope de guaraná)", 110, 0.7, 21.5, 3.7, 1.7),
    ("Alface", 11, 1.3, 1.7, 0.2, 1.8),
    ("Tomate", 15, 1.1, 3.1, 0.2, 1.2),
    ("Cenoura crua", 34, 1.3, 7.7, 0.2, 3.2),
    ("Brócolis cozido", 25, 2.1, 4.4, 0.5, 3.4),
    ("Couve refogada", 90, 1.7, 8.7, 6.6, 5.7),
    ("Abobrinha cozida", 15, 1.1, 3.0, 0.2, 1.6),
    ("Beterraba cozida", 32, 1.3, 7.2, 0.1, 1.9),
    ("Pepino", 10, 0.9, 2.0, 0.0, 1.1),
    ("Chuchu cozido", 19, 0.4, 4.8, 0.0, 1.0),
    ("Abóbora cabotiá cozida", 48, 1.4, 10.8, 0.7, 2.5),
    ("Milho verde", 98, 3.2, 17.1, 2.4, 4.6),
    ("Lentilha cozida", 93, 6.3, 16.3, 0.5, 7.9),
    ("Grão de bico cozido", 164, 8.9, 27.4, 2.6, 7.6),
    ("Aveia em flocos", 394, 13.9, 66.6, 8.5, 9.1),
    ("Granola", 420, 10.0, 64.0, 14.0, 7.0),
    ("Pipoca com óleo", 448, 9.9, 70.3, 15.9, 14.3),
    ("Amendoim torrado", 606, 22.5, 18.7, 54.0, 7.8),
    ("Pasta de amendoim", 588, 25.0, 20.0, 50.0, 6.0),
    ("Castanha do Pará", 643, 14.5, 15.1, 63.5, 7.9),
    ("Castanha de caju", 570, 18.5, 29.1, 46.3, 3.7),
    ("Chocolate ao leite", 540, 7.2, 59.6, 30.3, 2.2),
    ("Coxinha de frango frita", 283, 9.6, 34.5, 11.8, 5.0),
    ("Pastel de carne frito", 289, 10.0, 30.0, 15.0, 1.0),
    ("Pizza de muçarela", 286, 12.0, 32.0, 12.0, 2.0),
    ("Pamonha", 171, 2.6, 30.7, 4.8, 2.4),
    ("Whey protein concentrado", 400, 80.0, 8.0, 6.0, 0.0),
]


def _norm(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")


TACO_FOODS = [
    {
        "source": "taco",
        "code": f"taco-{i}",
        "name": name,
        "brand": "TACO",
        "calories": kcal,
        "protein": p,
        "carbs": c,
        "fat": f,
        "fiber": fib,
        "sugars": 0,
        "sodium": 0,
        "_n": _norm(name),
    }
    for i, (name, kcal, p, c, f, fib) in enumerate(_RAW)
]


TACO_BY_NORM = {f["_n"]: f for f in TACO_FOODS}
TACO_NAMES = [f["name"] for f in TACO_FOODS]


def find_taco(name: str):
    f = TACO_BY_NORM.get(_norm(name.strip()))
    return {k: v for k, v in f.items() if k != "_n"} if f else None


def search_taco(q: str, limit: int = 15):
    tokens = _norm(q).split()
    if not tokens:
        return []
    hits = [f for f in TACO_FOODS if all(t in f["_n"] for t in tokens)]
    # names starting with the query first
    hits.sort(key=lambda f: (not f["_n"].startswith(tokens[0]), len(f["name"])))
    return [{k: v for k, v in f.items() if k != "_n"} for f in hits[:limit]]
