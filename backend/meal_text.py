"""Meal parsing against the bundled nutrition table. No invented quantities or AI values."""
import re
from taco_foods import search_taco, find_taco, TACO_FOODS, _public, _norm

def parse_meal(text):
    parts = [p.strip() for p in re.split(r';|\n|(?<!\d),|,(?!\d)', text) if p.strip()]
    if not 1 <= len(parts) <= 30:
        raise ValueError('Descreva entre 1 e 30 alimentos por refeição.')
    items = []
    for part in parts:
        match = re.fullmatch(r'\s*(\d+(?:[.,]\d+)?)\s*(kg|g|gramas?|quilogramas?)\s*(?:de\s+)?(.+)', part, re.I)
        if not match:
            match = re.fullmatch(r'(.+?)\s+(\d+(?:[.,]\d+)?)\s*(kg|g|gramas?|quilogramas?)\s*', part, re.I)
            quantity, unit, name = (match[2], match[3], match[1]) if match else (None,None,part)
        else:
            quantity,unit,name = match.groups()
        grams = float(quantity.replace(',', '.')) * (1000 if unit.lower() in ('kg','quilograma','quilogramas') else 1) if quantity else None
        name = re.sub(r'\b(grelhado|cozido|assado|frito)\b', lambda m: {'grelhado':'grelhad','cozido':'cozid','assado':'assad','frito':'frit'}[m[0]], _norm(name))
        hits = search_taco(name,5)
        items.append({'description':part,'grams':grams if grams and 0 < grams <= 5000 else None,'candidates':hits,
                      'food':hits[0] if len(hits) == 1 else None,'warning': 'Informe o peso em gramas.' if not grams or not 0 < grams <= 5000 else 'Escolha o alimento na tabela.' if not hits else 'Mais de uma correspondência: escolha a variedade e o preparo.' if len(hits) > 1 else 'Confira variedade e preparo antes de salvar.'})
    return {'items':items,'notice':'Estimativas baseadas na TACO/NEPA-UNICAMP (2011) e referências comuns identificadas na tabela. Preparo, marcas e medidas podem alterar os valores. Use gramas ou kg.'}

def food_by_code(code):
    return next((_public(f) for f in TACO_FOODS if f['code']==code),None)
