"use strict";
(function () {
  const data = window.AgendaForecast;
  const get = id => document.getElementById(id);
  const format = number => number.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const dateLabel = text => text.split("-").reverse().join("/");
  const week = get("forecast-week");
  const service = get("forecast-service");
  const reveal = get("forecast-reveal");
  if (!data?.resultados?.length) {
    reveal.disabled = week.disabled = service.disabled = true;
    get("forecast-outcome").textContent = "As previsões não foram carregadas. Confira se previsoes.js está disponível com a página.";
    return;
  }
  let current;
  let serviceRows;
  let series = [];
  let inspected = 0;
  let highlighted = null;
  let selectedResult = null;
  const scoreButtons = [...get("score-buttons").querySelectorAll("button")];
  const scoreColors = { model:"var(--forecast-model)", average:"var(--forecast-average)", tie:"var(--primary)" };
  const lines = [
    { field:"modelo", title:"Modelo", meaning:"Previsão que aprende com o histórico.", color:"var(--forecast-model)", dash:"none" },
    { field:"media4", title:"Média de 4 semanas", meaning:"Previsão pela taxa média de faltas recente.", color:"var(--forecast-average)", dash:"8 5" },
    { field:"actual", title:"Faltas observadas", meaning:"Quantas faltas o histórico registrou.", color:"var(--forecast-actual)", dash:"2 5" }
  ];
  const element = (tag,text) => {
    const item = document.createElement(tag);
    item.textContent = text;
    return item;
  };
  function changeService() {
    const prev = week.value;
    serviceRows = data.resultados.filter(row => row.servico === service.value)
      .sort((a,b) => b.inicio.localeCompare(a.inicio));
    week.replaceChildren(...serviceRows.map(row => new Option(dateLabel(row.inicio),row.inicio)));
    if (serviceRows.some(row => row.inicio === prev)) week.value = prev;
    render();
  }
  function renderHistory(row) {
    const area = get("forecast-history");
    area.replaceChildren();
    const previous = row.historico4 || [];
    for (const point of previous) {
      const rate = 100 * point.faltas / point.ofertadas;
      const line = element("div","");
      line.className = "forecast-line";
      const track = element("span","");
      track.className = "forecast-track";
      const fill = element("i","");
      fill.style.width = rate + "%";
      track.append(fill);
      line.append(element("span",dateLabel(point.inicio).slice(0,5)),track,
        element("span",point.faltas + "/" + point.ofertadas),element("b",format(rate) + "%"));
      area.append(line);
    }
    get("forecast-baseline").textContent = "Média das taxas: " + format(100 * row.media4 / row.ofertadas) +
      "% × " + row.ofertadas + " vagas ≈ " + format(row.media4) + " faltas.";
  }
  function svgNode(tag, attrs, label) {
    const node = document.createElementNS("http://www.w3.org/2000/svg",tag);
    for (const [key,value] of Object.entries(attrs)) node.setAttribute(key,value);
    if (label !== undefined) node.textContent = label;
    return node;
  }
  function drawSeries() {
    if (!series.length) return;
    const svg = get("series-plot");
    const width = Math.max(250,svg.clientWidth);
    const left = 32, right = width - 27, top = 15, bottom = 182;
    let peak = 1;
    for (const r of series) peak = Math.max(peak,r.modelo,r.media4,r.actual ?? 0);
    const step = Math.max(1,Math.ceil(peak / 4));
    const x = i => series.length === 1 ? (left+right)/2 : left + i*(right-left)/(series.length-1);
    const y = value => bottom - value/(4*step)*(bottom-top);
    svg.setAttribute("viewBox", "0 0 " + width + " 215");
    svg.setAttribute("aria-valuemax",series.length);
    svg.setAttribute("aria-valuenow",inspected+1);
    svg.setAttribute("aria-valuetext",dateLabel(series[inspected].inicio));
    svg.replaceChildren();
    if (selectedResult) {
      const bandWidth = series.length === 1 ? right-left : (right-left)/(series.length-1);
      series.forEach((r,i) => {
        if (r.result !== selectedResult) return;
        const start = Math.max(left,x(i)-bandWidth/2);
        const span = Math.min(right,x(i)+bandWidth/2)-start;
        svg.append(svgNode("rect",{x:start,y:top,width:span,height:bottom-top,fill:scoreColors[selectedResult],opacity:0.12}),
          svgNode("rect",{x:start,y:top-3,width:span,height:3,fill:scoreColors[selectedResult]}));
      });
    }
    for (let tick=0; tick<=4; tick++) {
      const level = tick * step;
      svg.append(svgNode("line",{x1:left,x2:right,y1:y(level),y2:y(level),stroke:"#e1dfe9"}),
        svgNode("text",{x:left-6,y:y(level)+4,"text-anchor":"end"},level));
    }
    const labels = Math.min(series.length, Math.max(2,Math.floor(width / 86)));
    for (let j=0; j<labels; j++) {
      const i = labels===1 ? 0 : Math.round(j*(series.length-1)/(labels-1));
      svg.append(svgNode("text",{x:x(i),y:204,"text-anchor":"middle"},dateLabel(series[i].inicio).slice(0,5)));
    }
    const ordered = [...lines].sort((a,b) => Number(a.field===highlighted) - Number(b.field===highlighted));
    svg.append(svgNode("line",{x1:x(inspected),x2:x(inspected),y1:top,y2:bottom,stroke:"#615872","stroke-width":1.5,"stroke-dasharray":"4 4"}));
    for (const {field,title,color,dash} of ordered) {
      const points = series.map((r,i) => r[field] === null ? null : [x(i),y(r[field]),r]).filter(Boolean);
      if (!points.length) continue;
      const group = svgNode("g",{opacity:highlighted && highlighted!==field ? 0.16 : 1});
      group.append(svgNode("polyline",{points:points.map(([px,py])=>px+","+py).join(" "),fill:"none",
        stroke:color,"stroke-width":2.6,"stroke-linecap":"round","stroke-dasharray":dash}));
      const stride = Math.max(1,Math.ceil(points.length * 25 / (right-left)));
      points.forEach(([px,py,r],idx) => {
        if (idx % stride && idx !== inspected && idx !== points.length-1) return;
        const dot = seriesMarker(field,px,py,color);
        dot.append(svgNode("title",{},dateLabel(r.inicio)+" · "+title+" · "+format(r[field])+" faltas"));
        group.append(dot);
      });
      svg.append(group);
    }
    // A faixa inteira é clicável, inclusive quando duas curvas se sobrepõem.
    for (let i=0; i<series.length; i++) {
      const start = i===0 ? 0 : (x(i-1)+x(i))/2;
      const end = i===series.length-1 ? width : (x(i)+x(i+1))/2;
      const hit = svgNode("rect",{x:start,y:0,width:end-start,height:215,fill:"transparent","data-week-index":i});
      hit.append(svgNode("title",{},dateLabel(series[i].inicio)+" · clique para comparar"));
      svg.append(hit);
    }
  }
  function resultOf(model,average,observed) {
    if (observed === null) return null;
    const modelError = Math.abs(model-observed);
    const averageError = Math.abs(average-observed);
    if (format(modelError) === format(averageError)) return "tie";
    return modelError < averageError ? "model" : "average";
  }
  function verdict(model,average,observed) {
    const closest = {tie:"As duas tiveram o mesmo erro na precisão exibida.",model:"O modelo ficou mais perto.",
      average:"A média de quatro semanas ficou mais perto."}[resultOf(model,average,observed)];
    return closest+" Erro do modelo: "+format(Math.abs(model-observed))+" faltas. Erro da média: "+format(Math.abs(average-observed))+".";
  }
  function updateScore() {
    const counts = {model:0,average:0,tie:0};
    for (const r of series) if (r.result) counts[r.result]++;
    const known = counts.model + counts.average + counts.tie;
    get("score-context").textContent = current.servico+" · "+known+" de "+series.length+
      " semanas com resultado disponível.";
    for (const button of scoreButtons) {
      const count = counts[button.dataset.result];
      button.querySelector("strong").textContent = count;
      button.disabled = count === 0;
      button.setAttribute("aria-pressed",selectedResult === button.dataset.result);
    }
    get("score-picker").hidden = !selectedResult;
    const menu = get("score-week");
    menu.replaceChildren();
    if (selectedResult) series.forEach((row,i) => {
      if (row.result === selectedResult) menu.add(new Option(dateLabel(row.inicio),String(i)));
    });
  }
  function setScore(result) {
    selectedResult = result;
    updateScore();
    const next = result && series[inspected].result !== result ? Number(get("score-week").value) : inspected;
    inspect(next);
  }
  for (const button of scoreButtons) button.addEventListener("click",() => {
    setScore(selectedResult === button.dataset.result ? null : button.dataset.result);
  });
  get("score-week").addEventListener("change",event => inspect(Number(event.target.value)));
  get("score-reset").addEventListener("click",() => {
    const previous = scoreButtons.find(b => b.dataset.result === selectedResult);
    setScore(null);
    previous?.focus();
  });
  function inspect(index) {
    inspected = Math.max(0,Math.min(index,series.length-1));
    const row = series[inspected];
    if (selectedResult && row.result !== selectedResult) {
      selectedResult = null;
      updateScore();
    }
    if (selectedResult) get("score-week").value = String(inspected);
    get("insight-title").textContent = row.servico + " · " + dateLabel(row.inicio) + " a " + dateLabel(row.fim);
    const values = get("insight-values");
    values.replaceChildren();
    for (const line of lines) {
      const cell = element("div","");
      cell.style.setProperty("--series-color",line.color);
      cell.append(element("dt",line.title),element("dd",row[line.field] === null ? "Oculto" : format(row[line.field])));
      values.append(cell);
    }
    get("insight-verdict").textContent = row.actual === null ? "Revele o resultado para ver qual previsão chegou mais perto." :
      verdict(row.modelo,row.media4,row.actual);
    get("insight-reveal").hidden = row.actual !== null;
    drawSeries();
  }
  get("series-plot").addEventListener("click",event => {
    const hit = event.target.closest("[data-week-index]");
    if (hit) inspect(Number(hit.dataset.weekIndex));
  });
  get("series-plot").addEventListener("keydown",event => {
    const positions = {ArrowLeft:inspected-1,ArrowRight:inspected+1,Home:0,End:series.length-1};
    if (!Object.hasOwn(positions,event.key)) return;
    event.preventDefault();
    inspect(positions[event.key]);
  });
  get("insight-reveal").addEventListener("click",() => {
    reveal.click();
    get("series-plot").focus({preventScroll:true});
  });
  function seriesMarker(field,px,py,color) {
    if (field === "actual") return svgNode("path",{d:"M "+px+" "+(py-4)+" l4 4 -4 4 -4 -4 Z",fill:color,stroke:"white","stroke-width":0.7});
    if (field === "media4") return svgNode("rect",{x:px-3,y:py-3,width:6,height:6,fill:"white",stroke:color,"stroke-width":1.8});
    return svgNode("circle",{cx:px,cy:py,r:3.2,fill:color,stroke:"white","stroke-width":0.8});
  }
  const legend = get("series-legend");
  for (const line of lines) {
    const button = element("button","");
    button.type = "button";
    button.dataset.series = line.field;
    button.setAttribute("aria-pressed","false");
    const sample = svgNode("svg",{viewBox:"0 0 36 14","aria-hidden":"true"});
    sample.append(svgNode("line",{x1:1,x2:35,y1:7,y2:7,stroke:line.color,"stroke-width":2.6,"stroke-linecap":"round","stroke-dasharray":line.dash}),
      seriesMarker(line.field,18,7,line.color));
    button.append(sample,element("b",line.title),element("small",line.meaning));
    button.addEventListener("click",() => {
      highlighted = highlighted === line.field ? null : line.field;
      for (const item of legend.children) item.setAttribute("aria-pressed",item.dataset.series === highlighted);
      drawSeries();
    });
    legend.append(button);
  }
  function updateSeries(revealed) {
    series = serviceRows.filter(r => r.inicio <= current.inicio).reverse().map(r => ({
      inicio:r.inicio,fim:r.fim,servico:r.servico,ofertadas:r.ofertadas,treino_ate:r.treino_ate,
      modelo:r.modelo,media4:r.media4,actual:r.inicio === current.inicio && !revealed ? null : r.observado
    }));
    for (const row of series) row.result = resultOf(row.modelo,row.media4,row.actual);
    if (!revealed) selectedResult = null;
    updateScore();
    get("forecast-series").hidden = false;
    get("series-caption").textContent = current.servico+" · "+dateLabel(series[0].inicio)+" a "+dateLabel(current.fim)+" · faltas por semana";
    get("series-note").textContent = revealed ? "Resultado da semana selecionada incluído no gráfico e no CSV." :
      "Use Revelar resultado para incluir as faltas observadas da última semana exibida no gráfico e no CSV.";
    const table = get("series-values");
    table.replaceChildren();
    for (const r of series) {
      const tr = table.insertRow();
      for (const v of [dateLabel(r.inicio),format(r.modelo),format(r.media4),r.actual ?? "Oculto"]) {
        tr.insertCell().textContent = v;
      }
    }
    inspect(revealed ? inspected : series.length-1);
  }
  get("series-export").addEventListener("click",() => {
    if (!series.length) return;
    const columns = ["servico","inicio","fim","treino_ate","vagas","previsao_modelo","previsao_media_4_semanas","faltas_observadas","resultado_visivel","erro_absoluto_modelo","erro_absoluto_media4"];
    const numeric = n => n === null ? "" : n.toLocaleString("pt-BR",{maximumFractionDigits:4,useGrouping:false});
    const records = series.map(r => [
      /^[=+@-]/.test(r.servico) ? "'" + r.servico : r.servico,r.inicio,r.fim,r.treino_ate,r.ofertadas,
      numeric(r.modelo),numeric(r.media4),r.actual,r.actual === null ? "nao" : "sim",
      numeric(r.actual === null ? null : Math.abs(r.actual-r.modelo)),
      numeric(r.actual === null ? null : Math.abs(r.actual-r.media4))
    ]);
    const slug = MunicipalCSV.key(current.servico).replace(/[^a-z0-9]+/g,"-").slice(0,60);
    saveCSV([columns,...records],"previsao-semanal-"+slug+"-"+current.inicio+".csv");
    get("announce").textContent = "CSV gerado com " + series.length + " semanas de " + current.servico + ".";
  });
  new ResizeObserver(drawSeries).observe(get("series-plot"));
  function render() {
    current = serviceRows.find(row => row.inicio === week.value);
    reveal.disabled = false;
    reveal.textContent = "Revelar resultado";
    get("forecast-outcome").replaceChildren();
    get("forecast-context").textContent = current.ofertadas + " vagas · previsão feita com dados até " + dateLabel(current.treino_ate);
    get("forecast-values").replaceChildren();
    for (const [title,value,color] of [["Previsão do modelo",current.modelo,"ridge"],["Média de 4 semanas",current.media4,"average"]]) {
      const card = element("article","");
      card.className = "metric " + color;
      const name = element("span",title);
      name.className = "metric-name";
      card.append(name,element("strong",format(value)),element("small","faltas esperadas · " +
        format(100 * value / current.ofertadas) + "% das vagas"));
      get("forecast-values").append(card);
    }
    renderHistory(current);
    updateSeries(false);
    const scores = data.mae.servicos[service.value];
    get("forecast-scores").textContent = "Em " + serviceRows.length + " semanas avaliadas de " + service.value +
      ", a previsão do modelo ficou, em média, a " + format(scores.modelo) + " faltas do resultado. A média de quatro semanas ficou a " +
      format(scores.media4) + ". Quanto menor a diferença, melhor.";
    get("forecast-source").textContent = "Fonte das previsões: " + data.fonte + ".";
  }
  reveal.addEventListener("click",() => {
    get("forecast-outcome").replaceChildren(element("strong",current.observado + " faltas observadas"),
      element("p",verdict(current.modelo,current.media4,current.observado)));
    reveal.disabled = true;
    reveal.textContent = "Resultado revelado";
    updateSeries(true);
  });
  service.replaceChildren(...[...new Set(data.resultados.map(row => row.servico))].sort()
    .map(name => new Option(name,name)));
  service.addEventListener("change",changeService);
  week.addEventListener("change",render);
  changeService();
})();
