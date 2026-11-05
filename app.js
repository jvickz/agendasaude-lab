"use strict";
const { days, services, labels, scenarios, week, simulate, totals } = AgendaModel;
const byId = id => document.getElementById(id);
const percent = value => (100 * value).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
const dayShort = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const descriptions = {
  regular: "Rotina habitual de acesso digital e deslocamento.",
  transit: "Mais barreiras de deslocamento para manter o compromisso.",
  digital: "Menos pessoas alcançadas pelo lembrete digital."
};
let selectedDay = 0;
let page = 0;
let applied, reference, strategy;
const pageSize = 6;
const seed = 431;
function settings() {
  return { scenario: byId("scenario").value, sms: byId("sms").checked, phone: byId("phone").checked,
    queue: byId("queue").checked, budget: Number(byId("budget").value) };
}
function showDraft() {
  const draft = settings();
  byId("budget-label").textContent = draft.budget + " min";
  byId("scenario-hint").textContent = descriptions[draft.scenario];
  byId("phone-help").textContent = draft.sms
    ? "A equipe liga para quem não respondeu à mensagem, se houver tempo."
    : "Com o lembrete desligado, a equipe liga diretamente para quem tem horário reservado, se houver tempo.";
  byId("dirty").textContent = JSON.stringify(draft) === JSON.stringify(applied) ? "" : "Alterações pendentes. Simule para aplicar.";
}
function metric(name, value, sub, icon) {
  return '<article class="metric metric-' + icon + '"><span class="metric-name">' +
    '<svg class="ico" aria-hidden="true"><use href="#i-' + icon + '"></use></svg>' + name +
    '</span><strong>' + value + '</strong><small>' + sub + '</small></article>';
}
function renderComparison() {
  const base = totals(reference.rows);
  const plan = totals(strategy.rows);
  const gain = plan.occupied - base.occupied;
  byId("metrics").innerHTML =
    metric("Atendimentos a mais", "+" + gain, plan.prevented + " faltas evitadas · " + plan.replaced + " vagas usadas por outra pessoa", "gain") +
    metric("Vagas aproveitadas", percent(plan.occupied / plan.total), plan.occupied + " de " + plan.total + " horários com atendimento · sem ações: " + percent(base.occupied/base.total), "calendar") +
    metric("Tempo gasto pela equipe", strategy.minutes.reduce((sum, t) => sum + t, 0) + " min", strategy.calls + " ligações · " + strategy.offers + " ofertas de vaga na semana", "clock");
  const daily = days.map((name, d) => ({
    name, base: totals(reference.rows.filter(row => row.day === d)).occupied,
    plan: totals(strategy.rows.filter(row => row.day === d)).occupied
  }));
  const describe = daily.map(d => d.name + ": referência " + d.base + ", com estratégia " + d.plan).join(". ");
  const bars = daily.map(d => '<div class="pair">' + ["base","plan"].map(key =>
    '<div class="bar ' + key + '" style="height:' + (100 * d[key] / 40) + '%"><span>' + d[key] + '</span></div>').join("") + '</div>').join("");
  byId("chart").innerHTML = '<div class="chart" role="img" aria-label="' + describe + '"><div class="scale"><span>40</span><span>30</span><span>20</span><span>10</span><span>0</span></div><div class="plot">' +
    bars + '</div><div class="x-axis">' + dayShort.map(d => "<span>" + d + "</span>").join("") + "</div></div>";
  byId("graph-foot").innerHTML = '<p>Cenário aplicado <b>' + scenarios[applied.scenario] + '</b></p>' +
    '<div class="balance"><span>Faltas sem aviso<strong>' + base.absent + ' → ' + plan.absent +
    '</strong></span><span>Canceladas e ociosas<strong>' + base.cancelled + ' → ' + plan.cancelled + '</strong></span></div>';
  byId("announce").textContent = "Simulação aplicada. " + gain + " atendimentos adicionais. Ocupação de " + percent(plan.occupied / plan.total) + ".";
}
function run() {
  applied = settings();
  const data = week(seed, applied.scenario);
  reference = simulate(data, { sms: false, phone: false, queue: false, budget: 0 });
  strategy = simulate(data, applied);
  renderComparison();
  renderTable();
  showDraft();
  renderMunicipalComparison();
}
function tag(status) {
  return '<span class="tag ' + status + '">' + labels[status] + '</span>';
}
function renderTable() {
  for (const button of byId("days").children) button.setAttribute("aria-pressed", Number(button.value) === selectedDay);
  const service = byId("service").value;
  const selected = strategy.rows.filter(row => row.day === selectedDay && (service === "all" || row.service === Number(service)));
  const start = page * pageSize;
  byId("rows").innerHTML = selected.slice(start,start + pageSize).map(row => {
    const ref = reference.rows.find(item => item.id === row.id);
    return "<tr><td><b>" + row.time + "</b><small>" + row.id + "</small></td><td>" + services[row.service].name +
      "<small>" + services[row.service].kind + "</small></td><td>" + tag(ref.status) + "</td><td>" + tag(row.status) +
      '</td><td><button type="button" data-slot="' + row.id + '" aria-label="Ver percurso da vaga ' + row.id + '">Ver percurso ↗</button></td></tr>';
  }).join("");
  byId("row-count").textContent = days[selectedDay] + " · " + (start + 1) + "–" + Math.min(start + pageSize,selected.length) + " de " + selected.length + " vagas";
  byId("prev").disabled = page === 0;
  byId("next").disabled = start + pageSize >= selected.length;
}
function showDetails(id) {
  const row = strategy.rows.find(s => s.id === id);
  if (!row) return;
  const base = reference.rows.find(s => s.id === id);
  const flow = item => "<ol>" + item.events.map(event => "<li>" + event + "</li>").join("") + "</ol>";
  byId("detail-content").innerHTML = '<div class="eyebrow">Percurso da vaga ' + row.id + '</div><h2>' + services[row.service].name +
    '</h2><p>' + days[row.day] + " · " + row.time + " · " + services[row.service].kind + "</p><h3>Referência</h3>" + flow(base) +
    "<h3>Com estratégia</h3>" + flow(row);
  byId("detail").showModal();
}
function downloadResults() {
  const columns = ["cenario","semente","lembrete","telefone","fila","minutos_disponiveis_por_dia","dia","vaga","hora","tipo","servico","referencia","estrategia","percurso","ligacoes_tentadas","ofertas_a_fila","minutos_usados"];
  const records = strategy.rows.map((r,i) => [scenarios[applied.scenario],seed,applied.sms,applied.phone,applied.queue,applied.budget,
    days[r.day],r.id,r.time,services[r.service].kind,services[r.service].name,labels[reference.rows[i].status],labels[r.status],r.events.join(" | "),r.calls,r.offers,r.staffMinutes]);
  const actions = [applied.sms && "lembrete", applied.phone && "telefone", applied.queue && "fila"].filter(Boolean);
  saveCSV([columns,...records], ["agendasaude", applied.scenario, applied.budget + "min", actions.join("-") || "referencia"].join("-") + ".csv");
  byId("announce").textContent = "CSV gerado com os 200 horários da estratégia aplicada.";
}
function saveCSV(rows, filename) {
  const csv = rows.map(parts => parts.map(value => '"' + String(value ?? "").replaceAll('"','""') + '"').join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF",csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
byId("days").innerHTML = dayShort.map((day,i) => '<button type="button" value="' + i + '" aria-label="' + days[i] + '">' + day + "</button>").join("");
services.forEach((s,i) => byId("service").add(new Option(s.name, String(i))));
byId("days").addEventListener("click", event => {
  if (event.target.tagName !== "BUTTON") return;
  selectedDay = Number(event.target.value); page = 0; renderTable();
});
byId("service").addEventListener("change", () => { page = 0; renderTable(); });
byId("prev").addEventListener("click", () => { page--; renderTable(); });
byId("next").addEventListener("click", () => { page++; renderTable(); });
byId("rows").addEventListener("click", event => { if (event.target.dataset.slot) showDetails(event.target.dataset.slot); });
byId("controls").addEventListener("input", showDraft);
byId("controls").addEventListener("submit", event => { event.preventDefault(); run(); });
byId("export").addEventListener("click", downloadResults);
function compareStrategies() {
  const draft = settings();
  const data = week(seed, draft.scenario);
  const cases = [];
  for (let mask = 0; mask < 8; mask++) {
    const policy = { sms: Boolean(mask & 1), phone: Boolean(mask & 2), queue: Boolean(mask & 4), budget: draft.budget };
    const result = simulate(data, policy);
    const name = [policy.sms && "Lembrete",policy.phone && "Telefone",policy.queue && "Lista de espera"].filter(Boolean).join(" + ") || "Sem ações";
    cases.push({ mask, name, count: totals(result.rows).occupied, time: result.minutes.reduce((s,m) => s+m,0) });
  }
  cases.sort((a,b) => b.count - a.count || a.time - b.time || a.mask - b.mask);
  byId("compare-intro").textContent = scenarios[draft.scenario] + " · " + draft.budget + " min por dia. As combinações usam as mesmas 200 vagas. Selecione uma para aplicá-la ao painel.";
  byId("compare-list").innerHTML = cases.map(item =>
    '<button class="case" type="button" data-mask="' + item.mask + '"><b>' + item.name + '</b><span>' +
    item.count + ' atendimentos · ' + item.time + ' min na semana</span></button>').join("");
  byId("alternatives").showModal();
}
byId("compare").addEventListener("click", compareStrategies);
byId("compare-list").addEventListener("click", event => {
  const button = event.target.closest("button[data-mask]");
  if (!button) return;
  const mask = Number(button.dataset.mask);
  byId("sms").checked = Boolean(mask & 1);
  byId("phone").checked = Boolean(mask & 2);
  byId("queue").checked = Boolean(mask & 4);
  run();
  byId("alternatives").close();
});
document.querySelectorAll("[data-method]").forEach(button => button.addEventListener("click", () => byId("method").showModal()));
for (const dialog of document.querySelectorAll("dialog")) {
  if (!dialog.hasAttribute("aria-label")) dialog.setAttribute("aria-label", dialog.id === "method" ? "Como funciona" : "Percurso da vaga");
  dialog.querySelector(".close").addEventListener("click", () => dialog.close());
}
let municipalRows = [];
let cityComparison = null;
let importVersion = 0;
const periodKey = row => row.inicio + "/" + row.fim;
const localDate = iso => iso.split("-").reverse().join("/");

function refreshCityServices() {
  const menu = byId("city-service");
  const previous = menu.value;
  const rows = municipalRows.filter(row => periodKey(row) === byId("city-period").value);
  menu.replaceChildren(...rows.sort((a,b) => a.servico.localeCompare(b.servico,"pt-BR"))
    .map(row => new Option(row.servico, MunicipalCSV.key(row.servico))));
  if (Array.from(menu.options).some(option => option.value === previous)) menu.value = previous;
  renderMunicipalComparison();
}
function renderMunicipalComparison() {
  if (!municipalRows.length) return;
  const row = municipalRows.find(item => periodKey(item) === byId("city-period").value &&
    MunicipalCSV.key(item.servico) === byId("city-service").value);
  if (!row) return;
  const historical = MunicipalCSV.importedCounts(row);
  const service = services.findIndex(item => MunicipalCSV.key(item.name) === MunicipalCSV.key(row.servico));
  const sim = service < 0 ? null : MunicipalCSV.simulationCounts(totals(strategy.rows.filter(item => item.service === service)));
  const indicators = MunicipalCSV.compareIndicators(historical,sim);
  cityComparison = { row, historical, sim, indicators };
  const actions = [applied.sms && "lembrete", applied.phone && "telefone", applied.queue && "fila"].filter(Boolean);
  byId("city-context").textContent = historical.total + " vagas no arquivo. " + (sim
    ? sim.total + " na semana simulada · " + scenarios[applied.scenario] + " · " + (actions.join(" + ") || "sem ações") + " · " + applied.budget + " min/dia."
    : "Este serviço não tem equivalente na simulação.");
  const body = byId("city-rows");
  body.replaceChildren();
  const chart = byId("city-chart");
  chart.replaceChildren();
  for (const m of indicators) {
    const tr = body.insertRow();
    const display = (count,rate) => count === null ? "—" : rate === null ? "0 (sem oferta)" : count + " (" + formatCityNumber(rate) + "%)";
    for (const value of [m.label, display(m.historyCount,m.historyRate), display(m.simulationCount,m.simulationRate)]) tr.insertCell().textContent = value;
    tr.insertCell().textContent = m.difference === null ? "—" : m.difference.toLocaleString("pt-BR",{signDisplay:"exceptZero",maximumFractionDigits:1}) + " p.p.";
    const group = document.createElement("div");
    group.className = "city-group";
    const label = document.createElement("b");
    label.textContent = m.label;
    group.append(label);
    for (const [source,rate,color] of [["Histórico",m.historyRate,"history-color"],["Simulação",m.simulationRate,"plan"]]) {
      const series = document.createElement("div");
      series.className = "city-series";
      series.innerHTML = '<span class="city-track"><i></i></span><span></span>';
      const bar = series.querySelector("i");
      bar.className = color;
      bar.style.width = (rate ?? 0) + "%";
      const value = rate === null ? "—" : formatCityNumber(rate) + "%";
      series.lastChild.textContent = value;
      series.title = source + ": " + (rate === null ? "sem taxa disponível" : value);
      series.setAttribute("role","img");
      series.setAttribute("aria-label", m.label + ", " + series.title);
      group.append(series);
    }
    chart.append(group);
  }
}
function formatCityNumber(value) {
  return value === null ? "" : value.toLocaleString("pt-BR",{maximumFractionDigits:1,useGrouping:false});
}
byId("city-export").addEventListener("click",() => {
  if (!cityComparison) return;
  const { row,historical,sim,indicators } = cityComparison;
  const columns = ["inicio","fim","servico","cenario","semente","minutos_por_dia","lembrete","telefone","fila","indicador","ofertadas_historico","quantidade_historico","taxa_historico_pct","ofertadas_simulacao","quantidade_simulacao","taxa_simulacao_pct","diferenca_pp"];
  // O nome do serviço vem do arquivo importado, não deve virar uma fórmula ao abrir a planilha.
  const serviceText = /^[=+@-]/.test(row.servico) ? "'" + row.servico : row.servico;
  const records = indicators.map(m => [row.inicio,row.fim,serviceText,scenarios[applied.scenario],seed,applied.budget,
    applied.sms,applied.phone,applied.queue,m.label,historical.total,m.historyCount,formatCityNumber(m.historyRate),
    sim?.total,m.simulationCount,formatCityNumber(m.simulationRate),formatCityNumber(m.difference)]);
  const slug = MunicipalCSV.key(row.servico).replace(/[^a-z0-9]+/g,"-").slice(0,60) || "servico";
  saveCSV([columns,...records],["comparacao",slug,row.inicio,row.fim].join("-") + ".csv");
  byId("announce").textContent = "CSV da comparação gerado para " + row.servico + ".";
});
byId("city-file").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  const version = ++importVersion;
  byId("city-error").textContent = "";
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error("O limite por arquivo é de 2 MB.");
    const bytes = await file.arrayBuffer();
    if (version !== importVersion) return;
    let content;
    try { content = new TextDecoder("utf-8",{fatal:true}).decode(bytes); }
    catch { throw new Error("Salve o CSV com codificação UTF-8."); }
    const rows = MunicipalCSV.readCSV(content);
    const periods = [...new Set(rows.map(periodKey))].sort().reverse();
    municipalRows = rows;
    byId("city-period").replaceChildren(...periods.map(period => new Option(period.split("/").map(localDate).join(" a "),period)));
    refreshCityServices();
    byId("city-results").hidden = false;
    byId("city-status").textContent = file.name + " · " + rows.length + " registros importados.";
  } catch (error) {
    if (version !== importVersion) return;
    byId("city-error").textContent = "Falha na importação. " + error.message + (municipalRows.length ? " O arquivo anterior continua em exibição." : "");
  } finally {
    if (version === importVersion) byId("city-file").value = "";
  }
});
byId("city-period").addEventListener("change",refreshCityServices);
byId("city-service").addEventListener("change",renderMunicipalComparison);
byId("city-clear").addEventListener("click",() => {
  importVersion++;
  municipalRows = [];
  cityComparison = null;
  for (const id of ["city-period","city-service","city-chart","city-rows","city-context","city-error"]) byId(id).replaceChildren();
  byId("city-results").hidden = true;
  byId("city-file").value = "";
  byId("city-status").textContent = "Dados importados removidos.";
  byId("city-file").focus();
});
run();

