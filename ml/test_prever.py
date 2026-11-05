import unittest
from datetime import date
from prever import backtest, generate, read_history, samples
from pathlib import Path
from tempfile import TemporaryDirectory


class TemporalTest(unittest.TestCase):
    def test_each_service_completes_its_own_warmup(self):
        with TemporaryDirectory() as temp:
            path = Path(temp) / "history.csv"
            generate(path)
            groups = read_history(path)
            groups["Cardiologia"] = groups["Cardiologia"][25:]
            predictions = backtest(groups)
            cardio = [r for r in predictions if r["servico"] == "Cardiologia"]
            self.assertEqual(cardio[0]["inicio"], groups["Cardiologia"][56]["inicio"])
            for row in cardio:
                history = row["historico4"]
                self.assertEqual(len(history), 4)
                self.assertLess(history[-1]["fim"], row["inicio"])
                expected = row["ofertadas"] * sum(p["faltas"] / p["ofertadas"] for p in history) / 4
                self.assertAlmostEqual(row["media4"], expected, places=3)

    def test_future_outcomes_cannot_change_past_predictions(self):
        with TemporaryDirectory() as temp:
            path = Path(temp) / "history.csv"
            generate(path)
            groups = read_history(path)
            before = backtest(groups)
            for rows in groups.values():
                rows[-1]["faltas_sem_aviso"] = 0
            after = backtest(groups)
            for first, second in zip(before, after):
                self.assertEqual(first["modelo"], second["modelo"])
                self.assertEqual(first["media4"], second["media4"])
                self.assertLess(date.fromisoformat(first["treino_ate"]), date.fromisoformat(first["inicio"]))
                self.assertTrue(0 <= first["modelo"] <= first["ofertadas"])
            data = samples(groups)
            first = data[0]
            history = groups[first["servico"]][:4]
            self.assertAlmostEqual(first["baseline"], sum(r["faltas_sem_aviso"]/r["ofertadas"] for r in history)/4)


if __name__ == "__main__":
    unittest.main()
