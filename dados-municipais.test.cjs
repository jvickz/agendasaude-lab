const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { readCSV, importedCounts, simulationCounts } = require("./dados-municipais");
const header = "inicio;fim;servico;ofertadas;faltas_sem_aviso;cancelamentos;reocupadas";
const line = "2026-09-01;2026-09-30;Cardiologia;260;35;25;12";

test("as taxas comparam ofertas diferentes e distinguem zero de taxa indisponível", () => {
  const { compareIndicators } = require("./dados-municipais");
  const h = { total:220, occupied:176, absent:0, cancelled:44, replaced:0 };
  const s = { total:50, occupied:42, absent:3, cancelled:12, replaced:7 };
  const [att, missed] = compareIndicators(h,s);
  assert.deepEqual([att.historyRate,att.simulationRate,att.difference],[80,84,4]);
  assert.deepEqual([missed.historyRate,missed.difference],[0,6]);
  assert.equal(compareIndicators(h,null)[0].simulationCount,null);
  assert.equal(compareIndicators(h,null)[0].difference,null);
  assert.equal(compareIndicators({total:0,occupied:0,absent:0,cancelled:0,replaced:0},s)[0].historyRate,null);
});

test("o exemplo tem dois períodos e calcula as taxas com a oferta do próprio serviço", () => {
  const rows = readCSV(readFileSync(join(__dirname,"exemplo-prefeitura-ficticia.csv"),"utf8"));
  assert.equal(rows.length,8);
  const row = rows.find(r => r.inicio === "2026-09-01" && r.servico === "Ultrassonografia");
  assert.deepEqual(importedCounts(row), { total:220, occupied:176, absent:32, cancelled:21, replaced:9 });
  assert.deepEqual(simulationCounts({ total:50, occupied:42, absent:3, cancelled:5, replaced:7 }),
    { total:50, occupied:42, absent:3, cancelled:12, replaced:7 });
});

test("aceita BOM, vírgula, aspas e colunas fora de ordem", () => {
  const csv = '\uFEFFservico,ofertadas,inicio,fim,faltas_sem_aviso,cancelamentos,reocupadas\r\n"Consulta, ""A""",0,2024-02-29,2024-02-29,0,0,0';
  const [row] = readCSV(csv);
  assert.equal(row.servico,'Consulta, "A"');
  assert.equal(importedCounts(row).occupied,0);
});

test("recusa arquivo inválido antes de aceitar qualquer linha", () => {
  const invalid = [
    line.replace("09-30","09-31"), line.replace("2026-09-30","2025-09-30"),
    line.replace(";12",";26"),line.replace(";35",";250"),line.replace(";260",";-1"),
    line.replace(";35",";"),line.replace("Cardiologia",'"Cardiologia'),line.replace("Cardiologia","")
  ];
  invalid.forEach(row => assert.throws(() => readCSV(header + "\n" + row), /Linha 2/));
  assert.throws(() => readCSV(header + "\n" + line + "\n" + line.toUpperCase()),/repetidos/);
  assert.throws(() => readCSV(header),/pelo menos/);
  assert.throws(() => readCSV("nome;telefone\nPessoa;123"),/sete colunas/);
});
