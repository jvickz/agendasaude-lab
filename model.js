/* Modelo de agenda semanal. Cada sorteio pertence a uma vaga, e é compartilhado pelas estratégias. */
(function (root) {
  "use strict";
  const services = [
    { name: "Cardiologia", kind: "Consulta", count: 12, absence: 0.25 },
    { name: "Oftalmologia", kind: "Consulta", count: 10, absence: 0.29 },
    { name: "Ultrassonografia", kind: "Exame", count: 10, absence: 0.31 },
    { name: "Radiografia", kind: "Exame", count: 8, absence: 0.22 }
  ];
  const days = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
  const labels = {
    original: "Compareceu como agendado",
    prevented: "Falta evitada",
    replaced: "Vaga reocupada",
    cancelled: "Cancelada e ociosa",
    absent: "Falta sem aviso"
  };
  const scenarios = {
    regular: "Semana típica",
    transit: "Transporte limitado",
    digital: "Menor alcance digital"
  };
  function generator(seed) {
    let state = seed >>> 0;
    return function () {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }
  function week(seed, scenario) {
    const random = generator(seed);
    const slots = [];
    const waiting = services.map(() => []);
    for (let day = 0; day < days.length; day++) {
      for (const [service, config] of services.entries()) {
        for (let n = 0; n < config.count; n++) {
          const absent = random() < config.absence + (scenario === "transit" ? 0.12 : 0);
          slots.push({
            id: "V" + String(slots.length + 1).padStart(3, "0"), day, service, time: timeLabel(480 + 30 * n),
            absent, early: random() < 0.18, digital: random() < (scenario === "digital" ? 0.36 : 0.76),
            phone: random() < 0.78, responds: random() < 0.78,
            resolves: random() < (scenario === "transit" ? 0.18 : 0.40)
          });
        }
      }
    }
    for (const [service, config] of services.entries()) {
      for (let n = 0; n < config.count * 3; n++) {
        waiting[service].push({ id: "F" + service + "-" + (n + 1), ready: random() < (config.kind === "Exame" ? 0.58 : 0.78) });
      }
    }
    slots.sort((a,b) => a.day - b.day || a.time.localeCompare(b.time) || a.service - b.service);
    return { slots, waiting };
  }
  function timeLabel(minute) {
    return [Math.floor(minute / 60), minute % 60].map(v => String(v).padStart(2, "0")).join(":");
  }
  function simulate(data, policy) {
    const minutes = Array(5).fill(0);
    const cursor = Array(services.length).fill(0);
    let calls = 0, offers = 0;
    const rows = data.slots.map(slot => {
      const startMinutes = minutes[slot.day];
      const startCalls = calls;
      const startOffers = offers;
      const events = ["Horário reservado na agenda."];
      let status = slot.absent ? "absent" : "original";
      let reached = false;
      if (slot.absent && slot.early) {
        status = "cancelled";
        events.push("Desistência comunicada espontaneamente antes do atendimento.");
      } else {
        if (policy.sms) {
          reached = slot.digital && slot.responds;
          events.push(reached ? "Lembrete digital respondido." : "Lembrete digital sem resposta.");
        }
        if (!reached && policy.phone && minutes[slot.day] + 5 <= policy.budget) {
          minutes[slot.day] += 5;
          calls++;
          reached = slot.phone;
          events.push(reached ? "Ligação atendida (5 min)." : "Ligação sem resposta (5 min).");
        } else if (!reached && policy.phone) {
          events.push("Tempo da equipe insuficiente para tentar a ligação.");
        }
        if (slot.absent && reached) {
          status = slot.resolves ? "prevented" : "cancelled";
          events.push(slot.resolves ? "A pessoa conseguiu manter o compromisso." : "A pessoa liberou o horário com antecedência.");
        }
      }
      if (status === "cancelled" && policy.queue) {
        const list = data.waiting[slot.service];
        if (cursor[slot.service] >= list.length) events.push("Lista do serviço esgotada.");
        else if (minutes[slot.day] + 3 > policy.budget) events.push("Tempo da equipe insuficiente para uma oferta.");
        else {
          const candidate = list[cursor[slot.service]++];
          minutes[slot.day] += 3;
          offers++;
          events.push("Oferta por ordem da fila para " + candidate.id + " (3 min).");
          if (candidate.ready) {
            status = "replaced";
            events.push("Pessoa da fila aceitou e compareceu.");
          } else events.push("Pessoa da fila indisponível nesta rodada.");
        }
      }
      events.push(labels[status] + ".");
      return { ...slot, status, events, staffMinutes: minutes[slot.day] - startMinutes,
        calls: calls - startCalls, offers: offers - startOffers };
    });
    return { rows, minutes, calls, offers };
  }
  function totals(rows) {
    const counts = Object.fromEntries(Object.keys(labels).map(key => [key, 0]));
    rows.forEach(row => counts[row.status]++);
    return { ...counts, occupied: counts.original + counts.prevented + counts.replaced, total: rows.length };
  }
  const api = { services, days, scenarios, labels, week, simulate, totals };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AgendaModel = api;
})(globalThis);

