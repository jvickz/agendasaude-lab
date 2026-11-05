/* Leitura de um CSV agregado. Datas são civis, independentes do fuso horário. */
(function (root) {
  "use strict";
  const columns = ["inicio", "fim", "servico", "ofertadas", "faltas_sem_aviso", "cancelamentos", "reocupadas"];
  const key = text => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  function fields(line, sep, number) {
    // Os sete campos deste formato são escalares em uma única linha.
    const parts = [];
    let pos = 0;
    while (pos <= line.length) {
      let value = "";
      if (line[pos] === '"') {
        pos++;
        let closed = false;
        while (pos < line.length) {
          const ch = line[pos++];
          if (ch !== '"') value += ch;
          else if (line[pos] === '"') { value += '"'; pos++; }
          else { closed = true; break; }
        }
        if (!closed || (pos < line.length && line[pos] !== sep)) throw new Error("Linha " + number + ": aspas inválidas.");
      } else {
        const end = line.indexOf(sep,pos);
        const stop = end < 0 ? line.length : end;
        value = line.slice(pos,stop);
        if (value.includes('"')) throw new Error("Linha " + number + ": aspas inválidas.");
        pos = stop;
      }
      parts.push(value.trim());
      if (pos === line.length) break;
      pos++;
    }
    return parts;
  }
  function validDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const date = new Date(s + "T00:00:00Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === s;
  }
  function readCSV(content) {
    const lines = content.trim().split(/\r\n|\n|\r/);
    const sep = lines[0].includes(";") ? ";" : ",";
    const header = fields(lines[0],sep,1).map(key);
    if (header.length !== columns.length || !columns.every(col => header.includes(col))) {
      throw new Error("Use as sete colunas do modelo: " + columns.join(", ") + ".");
    }
    const rows = [];
    const seen = new Set();
    lines.slice(1).forEach((line,index) => {
      if (!line.trim()) return;
      const num = index + 2;
      const fail = message => { throw new Error("Linha " + num + ": " + message); };
      const cells = fields(line,sep,num);
      if (cells.length !== columns.length) fail("quantidade de campos diferente do cabeçalho.");
      const row = Object.fromEntries(header.map((col,i) => [col,cells[i]]));
      if (!validDate(row.inicio) || !validDate(row.fim) || row.inicio > row.fim) fail("confira as datas inicial e final no formato AAAA-MM-DD.");
      if (!row.servico) fail("informe o serviço.");
      for (const col of columns.slice(3)) {
        if (!/^\d+$/.test(row[col]) || !Number.isSafeInteger(Number(row[col]))) fail(col + " deve conter um inteiro não negativo.");
        row[col] = Number(row[col]);
      }
      if (row.reocupadas > row.cancelamentos) fail("vagas reocupadas excedem os cancelamentos.");
      if (row.faltas_sem_aviso > row.ofertadas - row.cancelamentos) fail("faltas e cancelamentos excedem a oferta.");
      const identity = JSON.stringify([row.inicio,row.fim,key(row.servico)]);
      if (seen.has(identity)) fail("serviço e período repetidos.");
      seen.add(identity);
      rows.push(row);
    });
    if (!rows.length) throw new Error("Inclua pelo menos uma linha de dados após o cabeçalho.");
    return rows;
  }
  function importedCounts(r) {
    return {
      total: r.ofertadas, occupied: r.ofertadas - r.faltas_sem_aviso - r.cancelamentos + r.reocupadas,
      absent: r.faltas_sem_aviso, cancelled: r.cancelamentos, replaced: r.reocupadas
    };
  }
  function simulationCounts(t) {
    return { total:t.total, occupied:t.occupied, absent:t.absent, cancelled:t.cancelled+t.replaced, replaced:t.replaced };
  }
  function compareIndicators(historical, simulated) {
    const measures = [["occupied","Atendimentos"],["absent","Faltas sem aviso"],["cancelled","Cancelamentos"],["replaced","Vagas reocupadas"]];
    return measures.map(([field,label]) => {
      const historyRate = historical.total ? 100 * historical[field] / historical.total : null;
      const simulationRate = simulated?.total ? 100 * simulated[field] / simulated.total : null;
      return { label, historyCount:historical[field], historyRate, simulationCount:simulated?.[field] ?? null, simulationRate,
        difference:historyRate === null || simulationRate === null ? null : simulationRate - historyRate };
    });
  }
  const api = { readCSV, key, importedCounts, simulationCounts, compareIndicators };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MunicipalCSV = api;
})(globalThis);
