"""Montador de treinos: biblioteca de exercicios e calculos puros (sem banco, faceis de testar)."""
from __future__ import annotations

import unicodedata
from typing import Any, Dict, List, Optional

GROUPS = {
    "peito": "Peito",
    "costas": "Costas",
    "ombros": "Ombros",
    "biceps": "Bíceps",
    "triceps": "Tríceps",
    "pernas": "Pernas",
    "gluteos": "Glúteos",
    "panturrilha": "Panturrilha",
    "abdomen": "Abdômen",
    "corpo_inteiro": "Corpo inteiro",
}

# (nome, grupo muscular principal)
_RAW = [
    # Peito
    ("Supino reto com barra", "peito"), ("Supino inclinado com barra", "peito"),
    ("Supino declinado com barra", "peito"), ("Supino reto com halteres", "peito"),
    ("Supino inclinado com halteres", "peito"), ("Supino na máquina", "peito"),
    ("Crucifixo com halteres", "peito"), ("Crucifixo na máquina (peck deck)", "peito"),
    ("Crossover na polia", "peito"), ("Flexão de braço", "peito"),
    ("Mergulho nas paralelas", "peito"),
    # Costas
    ("Puxada frontal na polia", "costas"), ("Puxada com pegada supinada", "costas"),
    ("Barra fixa", "costas"), ("Remada curvada com barra", "costas"),
    ("Remada unilateral com halter (serrote)", "costas"), ("Remada baixa na polia", "costas"),
    ("Remada cavalinho", "costas"), ("Remada na máquina", "costas"),
    ("Pullover com halter", "costas"), ("Levantamento terra", "costas"),
    # Ombros
    ("Desenvolvimento com barra", "ombros"), ("Desenvolvimento com halteres", "ombros"),
    ("Desenvolvimento na máquina", "ombros"), ("Elevação lateral com halteres", "ombros"),
    ("Elevação frontal com halteres", "ombros"), ("Crucifixo inverso", "ombros"),
    ("Remada alta", "ombros"), ("Encolhimento com halteres", "ombros"), ("Face pull", "ombros"),
    # Bíceps
    ("Rosca direta com barra", "biceps"), ("Rosca alternada com halteres", "biceps"),
    ("Rosca martelo", "biceps"), ("Rosca concentrada", "biceps"), ("Rosca Scott", "biceps"),
    ("Rosca na polia", "biceps"), ("Rosca inversa", "biceps"),
    # Tríceps
    ("Tríceps pulley com corda", "triceps"), ("Tríceps pulley com barra reta", "triceps"),
    ("Tríceps testa", "triceps"), ("Tríceps francês", "triceps"), ("Tríceps coice", "triceps"),
    ("Mergulho no banco", "triceps"), ("Supino fechado", "triceps"),
    # Pernas
    ("Agachamento livre", "pernas"), ("Agachamento no Smith", "pernas"),
    ("Agachamento hack", "pernas"), ("Agachamento sumô", "pernas"),
    ("Agachamento búlgaro", "pernas"), ("Leg press 45°", "pernas"),
    ("Cadeira extensora", "pernas"), ("Mesa flexora", "pernas"), ("Cadeira flexora", "pernas"),
    ("Stiff", "pernas"), ("Afundo (passada)", "pernas"),
    ("Cadeira adutora", "pernas"), ("Cadeira abdutora", "pernas"),
    # Glúteos
    ("Elevação pélvica (hip thrust)", "gluteos"), ("Ponte de glúteos", "gluteos"),
    ("Glúteo na polia (coice)", "gluteos"), ("Abdução de quadril na polia", "gluteos"),
    # Panturrilha
    ("Panturrilha em pé", "panturrilha"), ("Panturrilha sentado", "panturrilha"),
    ("Panturrilha no leg press", "panturrilha"),
    # Abdômen
    ("Abdominal crunch", "abdomen"), ("Elevação de pernas", "abdomen"), ("Prancha", "abdomen"),
    ("Abdominal na polia", "abdomen"), ("Abdominal bicicleta", "abdomen"),
    ("Abdominal oblíquo", "abdomen"), ("Roda abdominal", "abdomen"),
    # Corpo inteiro
    ("Burpee", "corpo_inteiro"), ("Kettlebell swing", "corpo_inteiro"),
    ("Agachamento com salto", "corpo_inteiro"), ("Mountain climber", "corpo_inteiro"),
    ("Thruster", "corpo_inteiro"),
]

EXERCISES: List[Dict[str, str]] = [{"name": n, "group": g} for n, g in _RAW]


def norm(s: str) -> str:
    """minusculas, sem acento e sem espacos nas pontas (para comparar nomes)."""
    return "".join(c for c in unicodedata.normalize("NFD", s.lower().strip()) if unicodedata.category(c) != "Mn")


_NORMALIZED = [(norm(e["name"]), e) for e in EXERCISES]


def search_exercises(q: str = "", group: Optional[str] = None, limit: int = 120) -> List[Dict[str, str]]:
    tokens = norm(q).split()
    out = [e for n, e in _NORMALIZED
           if (not group or e["group"] == group) and all(t in n for t in tokens)]
    return out[:limit]


def set_volume(s: Dict[str, Any]) -> float:
    return float(s.get("reps", 0)) * float(s.get("weight_kg", 0))


def session_totals(exercises: List[Dict[str, Any]]) -> Dict[str, float]:
    """Volume (kg = repeticoes x carga) e numero de series. So conta series concluidas."""
    volume, total_sets = 0.0, 0
    for ex in exercises:
        for s in ex.get("sets", []):
            if s.get("done", True):
                volume += set_volume(s)
                total_sets += 1
    return {"volume_kg": round(volume, 1), "total_sets": total_sets}


def last_performance(sessions_newest_first: List[Dict[str, Any]], names: Optional[List[str]] = None) -> Dict[str, Dict[str, Any]]:
    """Ultima vez que cada exercicio foi feito: {nome_normalizado: {name, date, sets}}.
    Serve para o app sugerir a carga da ultima vez (progressao de carga)."""
    wanted = {norm(n) for n in names} if names else None
    out: Dict[str, Dict[str, Any]] = {}
    for sess in sessions_newest_first:
        for ex in sess.get("exercises", []):
            k = norm(ex["name"])
            if k in out or (wanted is not None and k not in wanted) or not ex.get("sets"):
                continue
            out[k] = {
                "name": ex["name"],
                "date": sess["date"],
                "sets": [{"reps": s["reps"], "weight_kg": s["weight_kg"]} for s in ex["sets"]],
            }
    return out


# ---------------------------------------------------------------------------
# Gasto calorico estimado, recordes pessoais e evolucao por exercicio
# ---------------------------------------------------------------------------
# MET (equivalente metabolico) de musculacao. O Compendio de Atividades Fisicas traz de 3,5
# (varios exercicios, 8-15 repeticoes) a 6,0 (esforco vigoroso); usamos um valor intermediario-baixo
# porque o tempo do treino inclui os descansos. E uma ESTIMATIVA, nao uma medicao.
WEIGHT_TRAINING_MET = 4.0


def estimate_calories(duration_min: float, weight_kg: float, met: float = WEIGHT_TRAINING_MET) -> int:
    """kcal = MET x peso (kg) x horas."""
    if duration_min <= 0 or weight_kg <= 0:
        return 0
    return int(round(met * weight_kg * duration_min / 60.0))


def epley(weight_kg: float, reps: int) -> float:
    """1RM estimado (formula de Epley): carga x (1 + repeticoes / 30)."""
    return float(weight_kg) if reps <= 1 else float(weight_kg) * (1 + reps / 30.0)


def exercise_marks(sets: List[Dict[str, Any]]) -> Dict[str, float]:
    """Melhores marcas de um conjunto de series de UM exercicio."""
    max_weight = est_1rm = 0.0
    max_reps = bw_reps = 0
    volume = 0.0
    for s in sets:
        reps, w = int(s["reps"]), float(s["weight_kg"])
        volume += reps * w
        max_reps = max(max_reps, reps)
        if w == 0:
            bw_reps = max(bw_reps, reps)  # exercicio com o peso do corpo
        elif reps >= 1:
            max_weight = max(max_weight, w)
            if reps <= 12:  # acima disso a estimativa de 1RM perde confiabilidade
                est_1rm = max(est_1rm, epley(w, reps))
    return {"max_weight": max_weight, "est_1rm": round(est_1rm, 1), "max_reps": max_reps,
            "bw_reps": bw_reps, "volume": round(volume, 1)}


def _sets_of(sessions: List[Dict[str, Any]], key: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for sess in sessions:
        for ex in sess.get("exercises", []):
            if norm(ex["name"]) == key:
                out.extend(ex.get("sets", []))
    return out


def detect_records(prior_sessions: List[Dict[str, Any]], new_exercises: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Recordes pessoais deste treino em relacao ao historico. No maximo UM por exercicio
    (carga maxima > 1RM estimado > repeticoes com o peso do corpo). A primeira vez que um
    exercicio e feito nao conta como recorde: ainda nao ha o que superar."""
    out: List[Dict[str, Any]] = []
    for ex in new_exercises:
        prev_sets = _sets_of(prior_sessions, norm(ex["name"]))
        if not prev_sets:
            continue
        prev, cur = exercise_marks(prev_sets), exercise_marks(ex["sets"])
        if cur["max_weight"] > prev["max_weight"]:
            reps = max(int(s["reps"]) for s in ex["sets"] if float(s["weight_kg"]) == cur["max_weight"])
            out.append({"name": ex["name"], "kind": "carga", "value": cur["max_weight"],
                        "previous": prev["max_weight"], "reps": reps})
        elif cur["est_1rm"] > prev["est_1rm"]:
            out.append({"name": ex["name"], "kind": "1rm", "value": cur["est_1rm"],
                        "previous": prev["est_1rm"], "reps": None})
        elif prev["bw_reps"] > 0 and cur["bw_reps"] > prev["bw_reps"]:
            out.append({"name": ex["name"], "kind": "reps", "value": cur["bw_reps"],
                        "previous": prev["bw_reps"], "reps": cur["bw_reps"]})
    return out


def exercise_progress(sessions_oldest_first: List[Dict[str, Any]], name: str) -> Dict[str, Any]:
    """Uma entrada por treino em que o exercicio apareceu + os melhores marcos de todos os tempos."""
    key = norm(name)
    points: List[Dict[str, Any]] = []
    shown_name = name
    for sess in sessions_oldest_first:
        for ex in sess.get("exercises", []):
            if norm(ex["name"]) == key and ex.get("sets"):
                shown_name = ex["name"]
                points.append({
                    "date": sess["date"],
                    **exercise_marks(ex["sets"]),
                    "sets": [{"reps": s["reps"], "weight_kg": s["weight_kg"]} for s in ex["sets"]],
                })
    records: Dict[str, Any] = {"max_weight": None, "best_1rm": None}
    for p in points:
        if p["max_weight"] > (records["max_weight"] or {"value": 0})["value"]:
            records["max_weight"] = {"value": p["max_weight"], "date": p["date"]}
        if p["est_1rm"] > (records["best_1rm"] or {"value": 0})["value"]:
            records["best_1rm"] = {"value": p["est_1rm"], "date": p["date"]}
    return {"name": shown_name, "points": points, "records": records}


def exercises_done(sessions_oldest_first: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Exercicios que a pessoa ja fez: {name, sessions, last_date}, do mais recente ao mais antigo."""
    acc: Dict[str, Dict[str, Any]] = {}
    for sess in sessions_oldest_first:
        seen = set()
        for ex in sess.get("exercises", []):
            k = norm(ex["name"])
            if k in seen or not ex.get("sets"):
                continue
            seen.add(k)
            cur = acc.setdefault(k, {"name": ex["name"], "sessions": 0, "last_date": sess["date"]})
            cur["sessions"] += 1
            cur["name"], cur["last_date"] = ex["name"], sess["date"]
    return sorted(acc.values(), key=lambda e: (e["last_date"], e["name"]), reverse=True)
