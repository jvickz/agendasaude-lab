"""Experimento semanal com regressão Ridge e avaliação temporal expansiva."""
import argparse
import csv
import hashlib
import json
import math
import random
from tempfile import NamedTemporaryFile
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import numpy as np
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[1]
SERVICES = ["Cardiologia", "Oftalmologia", "Ultrassonografia", "Radiografia"]
COLUMNS = ["inicio", "fim", "servico", "ofertadas", "faltas_sem_aviso", "cancelamentos", "reocupadas"]


def generate(path):
    rng = random.Random(431)
    rows = []
    start = date(2024, 10, 7)
    for week in range(104):
        day = start + timedelta(weeks=week)
        for service, name in enumerate(SERVICES):
            offered = rng.randint(35, 75)
            probability = [0.22, 0.27, 0.30, 0.18][service]
            probability += 0.07 * math.sin(2 * math.pi * week / 52 + service * 0.3)
            probability += 0.0004 * week
            missed = sum(rng.random() < probability for _ in range(offered))
            cancelled = rng.randint(2, 7)
            rows.append(dict(zip(COLUMNS, [day.isoformat(), (day + timedelta(days=6)).isoformat(),
                                          name, offered, missed, cancelled, rng.randint(0, cancelled)])))
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as out:
        writer = csv.DictWriter(out, fieldnames=COLUMNS, delimiter=";")
        writer.writeheader()
        writer.writerows(rows)


def read_history(path):
    with path.open(encoding="utf-8-sig", newline="") as source:
        header = source.readline()
        source.seek(0)
        reader = csv.DictReader(source, delimiter=";" if ";" in header else ",")
        if sorted(reader.fieldnames or []) != sorted(COLUMNS):
            raise ValueError("O cabeçalho deve conter as sete colunas do CSV semanal de exemplo.")
        records = list(reader)
    groups = defaultdict(list)
    for number, row in enumerate(records, start=2):
        if None in row or any(v is None or not v.strip() for v in row.values()):
            raise ValueError(f"Linha {number}: confira a quantidade de campos e os valores em branco.")
        try:
            start, end = date.fromisoformat(row["inicio"]), date.fromisoformat(row["fim"])
        except ValueError as exc:
            raise ValueError(f"Linha {number}: datas inválidas. Use AAAA-MM-DD.") from exc
        row["inicio"], row["fim"] = start.isoformat(), end.isoformat()
        if (end - start).days != 6:
            raise ValueError("Cada período deve ter sete dias inclusivos.")
        for column in COLUMNS[3:]:
            row[column] = int(row[column])
            if row[column] < 0:
                raise ValueError("Contagens devem ser não negativas.")
        if row["ofertadas"] <= 0 or row["reocupadas"] > row["cancelamentos"]:
            raise ValueError("Confira oferta e reocupações.")
        if row["faltas_sem_aviso"] + row["cancelamentos"] > row["ofertadas"]:
            raise ValueError("Faltas e cancelamentos excedem a oferta.")
        if not row["servico"].strip():
            raise ValueError("Informe o serviço.")
        row["servico"] = row["servico"].strip()
        groups[row["servico"]].append(row)
    for rows in groups.values():
        rows.sort(key=lambda row: row["inicio"])
        for previous, current in zip(rows, rows[1:]):
            if date.fromisoformat(current["inicio"]) - date.fromisoformat(previous["inicio"]) != timedelta(days=7):
                raise ValueError("Use semanas consecutivas, sem lacunas ou duplicatas, por serviço.")
    return groups


def samples(groups):
    names = sorted(groups)
    result = []
    for name, rows in groups.items():
        for index in range(4, len(rows)):
            row = rows[index]
            previous = rows[index-4:index]
            rates = [item["faltas_sem_aviso"] / item["ofertadas"] for item in previous]
            day = date.fromisoformat(row["inicio"])
            phase = 2 * math.pi * day.timetuple().tm_yday / 365.25
            features = rates + [math.sin(phase), math.cos(phase), row["ofertadas"]]
            features += [float(name == service) for service in names]
            history = [{"inicio": item["inicio"], "fim": item["fim"], "ofertadas": item["ofertadas"],
                        "faltas": item["faltas_sem_aviso"]} for item in previous]
            result.append(dict(row, features=features, baseline=sum(rates) / 4, historico4=history,
                               target=row["faltas_sem_aviso"] / row["ofertadas"]))
    return sorted(result, key=lambda row: (row["inicio"], row["servico"]))


def backtest(groups, warmup=52):
    data = samples(groups)
    # Cada serviço completa o próprio aquecimento, inclusive com calendários defasados.
    eligible = defaultdict(list)
    for name in groups:
        service_samples = [row for row in data if row["servico"] == name]
        for row in service_samples[warmup:]:
            eligible[row["inicio"]].append(row)
    if not eligible:
        raise ValueError(f"Forneça ao menos {warmup + 5} semanas consecutivas em um serviço.")
    predictions = []
    for week in sorted(eligible):
        training = [row for row in data if row["fim"] < week]
        testing = eligible[week]
        # Escala e coeficientes ajustados somente nas semanas anteriores.
        model = make_pipeline(StandardScaler(), Ridge(alpha=10.0))
        model.fit([row["features"] for row in training], [row["target"] for row in training])
        for row, prediction in zip(testing, model.predict([row["features"] for row in testing])):
            n = row["ofertadas"]
            predictions.append({
                "inicio": week, "fim": row["fim"], "servico": row["servico"], "ofertadas": n,
                "observado": row["faltas_sem_aviso"], "modelo": round(float(np.clip(prediction, 0, 1)) * n, 4),
                "media4": round(row["baseline"] * n, 4), "treino_ate": max(item["fim"] for item in training),
                "historico4": row["historico4"]
            })
    return predictions


def report(predictions):
    def metrics(rows):
        return {method: round(sum(abs(row[method] - row["observado"]) for row in rows) / len(rows), 3)
                for method in ["modelo", "media4"]}
    return {"geral": metrics(predictions),
            "servicos": {name: metrics([row for row in predictions if row["servico"] == name])
                         for name in sorted({row["servico"] for row in predictions})}}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=ROOT / "historico-semanal-ficticio.csv")
    parser.add_argument("--generate-example", action="store_true")
    args = parser.parse_args()
    if args.generate_example:
        if args.input.resolve() != (ROOT / "historico-semanal-ficticio.csv").resolve():
            parser.error("--generate-example só pode gravar o arquivo fictício do projeto.")
        generate(args.input)
    try:
        predictions = backtest(read_history(args.input))
    except (OSError, ValueError, csv.Error) as exc:
        parser.error(str(exc))
    data = {"fonte": args.input.name, "sha256": hashlib.sha256(args.input.read_bytes()).hexdigest(),
            "metodo": "Regressão Ridge, alpha=10, escala ajustada em cada treino",
            "resultados": predictions, "mae": report(predictions)}
    with NamedTemporaryFile("w", dir=ROOT, encoding="utf-8", delete=False) as output:
        output.write("window.AgendaForecast = " + json.dumps(data, ensure_ascii=False) + ";\n")
    Path(output.name).replace(ROOT / "previsoes.js")
    print(json.dumps({"avaliacoes": len(predictions), "mae": data["mae"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
