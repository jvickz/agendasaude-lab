const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("./model.js");

test("as estratégias conservam vagas, respeitam a capacidade e contabilizam o esforço", () => {
  for (const scenario of Object.keys(model.scenarios)) {
    const data = model.week(431, scenario);
    const baseline = model.totals(model.simulate(data, { budget: 0 }).rows);
    for (let budget = 0; budget <= 120; budget += 5) {
      for (let mask = 0; mask < 8; mask++) {
        const result = model.simulate(data, { budget, sms: !!(mask&1), phone: !!(mask&2), queue: !!(mask&4) });
        const totals = model.totals(result.rows);
        assert.equal(totals.total, 200);
        assert.equal(totals.occupied + totals.cancelled + totals.absent, 200);
        assert.equal(totals.occupied - baseline.occupied, totals.prevented + totals.replaced);
        assert(result.minutes.every(m => m <= budget));
        assert.equal(result.minutes.reduce((s,m) => s+m,0), result.calls * 5 + result.offers * 3);
        assert.equal(result.rows.reduce((sum,row) => sum + row.calls,0), result.calls);
        assert.equal(result.rows.reduce((sum,row) => sum + row.offers,0), result.offers);
        for (let day = 0; day < model.days.length; day++) {
          const dayRows = result.rows.filter(row => row.day === day);
          assert.equal(dayRows.reduce((sum,row) => sum + row.staffMinutes,0), result.minutes[day]);
        }
        assert.equal(new Set(result.rows.map(row => row.id)).size, 200);
        if (!(mask&4) || budget < 3) assert.equal(totals.replaced, 0);
      }
    }
  }
});
test("silêncio mantém a reserva e apenas o cancelamento abre vaga para oferta", () => {
  const preset = { id:"V001", day:0, service:0, absent:true, early:false, phone:false,
    digital:false, responds:false, resolves:false, time:"08:00" };
  const data = { slots:[preset], waiting:[[{id:"F1",ready:true}]] };
  const policy = { sms:true, phone:true, queue:true, budget:10 };
  const silent = model.simulate(data, policy);
  assert.equal(silent.rows[0].status, "absent");
  assert.equal(silent.offers, 0);
  const cancelled = model.simulate({ ...data, slots:[{ ...preset, early:true }] }, policy);
  assert.equal(cancelled.rows[0].status, "replaced");
  assert.equal(cancelled.offers, 1);
});
test("a mesma pessoa da fila pode ocupar no máximo um horário na semana", () => {
  const slot = { service:0, absent:true, early:true, day:0 };
  const data = { slots:[{...slot,id:"A"},{...slot,id:"B",day:1}], waiting:[[{id:"F1",ready:true}]] };
  const result = model.simulate(data,{queue:true,budget:45});
  assert.deepEqual(result.rows.map(r=>r.status),["replaced","cancelled"]);
});

