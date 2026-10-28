"""Testes offline do montador de treinos (nao precisam de servidor nem de banco)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import workouts_lib as W  # noqa: E402


def test_biblioteca_sem_duplicados_e_com_grupos_validos():
    names = [W.norm(e["name"]) for e in W.EXERCISES]
    assert len(names) == len(set(names)) and len(names) >= 70
    assert all(e["group"] in W.GROUPS for e in W.EXERCISES)
    assert all(len(e["name"]) <= 80 for e in W.EXERCISES)  # cabe na validacao do servidor
    assert set(W.GROUPS) == {e["group"] for e in W.EXERCISES}  # nenhum grupo vazio


def test_busca_ignora_acento_e_filtra_por_grupo():
    assert any(e["name"] == "Tríceps testa" for e in W.search_exercises("triceps testa"))
    assert all(e["group"] == "pernas" for e in W.search_exercises("", "pernas"))
    assert W.search_exercises("supino", "costas") == []
    assert len(W.search_exercises("")) == len(W.EXERCISES)
    assert W.search_exercises("zzzz") == []


def test_volume_conta_so_series_concluidas():
    ex = [{"name": "Supino", "sets": [
        {"reps": 10, "weight_kg": 60, "done": True},
        {"reps": 8, "weight_kg": 62.5, "done": True},
        {"reps": 5, "weight_kg": 100, "done": False},   # nao conta
    ]}, {"name": "Flexão", "sets": [{"reps": 15, "weight_kg": 0}]}]  # sem 'done' = concluida
    t = W.session_totals(ex)
    assert t == {"volume_kg": 1100.0, "total_sets": 3}


def _sess(date, name, sets):
    return {"date": date, "exercises": [{"name": name, "sets": sets}]}


def test_ultima_performance_usa_a_sessao_mais_recente_por_exercicio():
    newest_first = [
        _sess("2026-10-18", "Supino reto com barra", [{"reps": 8, "weight_kg": 65}]),
        {"date": "2026-10-15", "exercises": [
            {"name": "supino reto com barra", "sets": [{"reps": 10, "weight_kg": 60}]},   # mais antigo: ignorado
            {"name": "Agachamento livre", "sets": [{"reps": 6, "weight_kg": 100}]},
        ]},
    ]
    last = W.last_performance(newest_first, ["Supino reto com barra", "Agachamento livre", "Stiff"])
    assert last[W.norm("Supino reto com barra")]["date"] == "2026-10-18"
    assert last[W.norm("Supino reto com barra")]["sets"] == [{"reps": 8, "weight_kg": 65}]
    assert last[W.norm("Agachamento livre")]["date"] == "2026-10-15"
    assert W.norm("Stiff") not in last                      # nunca feito
    assert "supino reto com barra" in last                  # chave normalizada (sem acento/caixa)


def test_estimativa_de_calorias_por_met():
    assert W.estimate_calories(60, 70) == 280          # 4,0 MET x 70 kg x 1 h
    assert W.estimate_calories(45, 80) == 240
    assert W.estimate_calories(0, 70) == 0 and W.estimate_calories(30, 0) == 0


def test_1rm_epley_e_marcas():
    assert W.epley(100, 1) == 100 and round(W.epley(60, 10), 1) == 80.0
    m = W.exercise_marks([{"reps": 10, "weight_kg": 60}, {"reps": 8, "weight_kg": 65}, {"reps": 5, "weight_kg": 100}])
    assert m["max_weight"] == 100 and m["est_1rm"] == 116.7 and m["volume"] == 1620.0
    bw = W.exercise_marks([{"reps": 12, "weight_kg": 0}, {"reps": 10, "weight_kg": 0}])
    assert bw["bw_reps"] == 12 and bw["max_weight"] == 0 and bw["est_1rm"] == 0
    # acima de 12 repeticoes nao entra na estimativa de 1RM
    assert W.exercise_marks([{"reps": 20, "weight_kg": 40}])["est_1rm"] == 0


def _ex(name, *sets):
    return {"name": name, "sets": [{"reps": r, "weight_kg": w} for r, w in sets]}


def test_recordes_pessoais():
    prior = [{"exercises": [_ex("Supino reto com barra", (8, 65)), _ex("Flexão de braço", (12, 0)), _ex("Stiff", (5, 80))]}]
    new = [
        _ex("supino reto com barra", (6, 67.5)),   # carga maior (nome em outra caixa)
        _ex("Flexão de braço", (15, 0)),            # mais repeticoes com o peso do corpo
        _ex("Stiff", (8, 75)),                      # carga menor, mas 1RM estimado maior
        _ex("Agachamento livre", (5, 100)),         # primeira vez: nao e recorde
    ]
    recs = {r["name"].lower(): r for r in W.detect_records(prior, new)}
    assert recs["supino reto com barra"]["kind"] == "carga" and recs["supino reto com barra"]["value"] == 67.5
    assert recs["supino reto com barra"]["previous"] == 65 and recs["supino reto com barra"]["reps"] == 6
    assert recs["flexão de braço"]["kind"] == "reps" and recs["flexão de braço"]["value"] == 15
    assert recs["stiff"]["kind"] == "1rm" and recs["stiff"]["value"] == 95.0
    assert "agachamento livre" not in recs and len(recs) == 3
    # igualar a marca nao e recorde
    assert W.detect_records(prior, [_ex("Supino reto com barra", (8, 65))]) == []


def test_evolucao_por_exercicio():
    sessions = [
        {"date": "2026-10-01", "exercises": [_ex("Supino reto com barra", (10, 60))]},
        {"date": "2026-10-08", "exercises": [_ex("Supino reto com barra", (8, 65)), _ex("Stiff", (10, 50))]},
        {"date": "2026-10-15", "exercises": [_ex("Supino reto com barra", (6, 62.5))]},
    ]
    p = W.exercise_progress(sessions, "supino reto com barra")
    assert [x["date"] for x in p["points"]] == ["2026-10-01", "2026-10-08", "2026-10-15"]
    assert p["records"]["max_weight"] == {"value": 65.0, "date": "2026-10-08"}
    assert p["records"]["best_1rm"]["date"] == "2026-10-08"
    assert W.exercise_progress(sessions, "Nunca feito")["points"] == []
    done = W.exercises_done(sessions)
    assert [e["name"] for e in done] == ["Supino reto com barra", "Stiff"]       # o mais recente primeiro
    assert done[0]["sessions"] == 3 and done[1]["sessions"] == 1 and done[0]["last_date"] == "2026-10-15"
