// backend/src/services/tendenciaMensalCausa.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTendenciaMensalPorCausa } from "./tendenciaMensalCausa.js";

test("agrupa valor aprovado por mês (da dataAprovacao) e causa", () => {
  const chamados = [{ Chave: 1 }, { Chave: 2 }, { Chave: 3 }];
  const historicoMap = new Map([
    [1, { causa: "Mau uso", dataAprovacao: "2026-06-10", valorAprovacao: 100 }],
    [2, { causa: "Mau uso", dataAprovacao: "2026-06-20", valorAprovacao: 50 }],
    [3, { causa: "Desgaste natural", dataAprovacao: "2026-07-05", valorAprovacao: 200 }],
  ]);

  const resultado = buildTendenciaMensalPorCausa(chamados, historicoMap);

  assert.deepEqual(resultado.causas, ["Desgaste natural", "Mau uso"]);
  assert.equal(resultado.porMes.length, 2);
  assert.deepEqual(resultado.porMes[0], { mes: "2026-06", causa: "Mau uso", valor: 150, total: 2 });
  assert.deepEqual(resultado.porMes[1], { mes: "2026-07", causa: "Desgaste natural", valor: 200, total: 1 });
});

test("ignora chamado sem causa ou sem dataAprovacao no histórico", () => {
  const chamados = [{ Chave: 1 }, { Chave: 2 }, { Chave: 3 }];
  const historicoMap = new Map([
    [1, { causa: null, dataAprovacao: "2026-06-10", valorAprovacao: 100 }],
    [2, { causa: "Mau uso", dataAprovacao: null, valorAprovacao: 100 }],
    [3, {}],
  ]);

  assert.deepEqual(buildTendenciaMensalPorCausa(chamados, historicoMap), { causas: [], porMes: [] });
});

test("ordena porMes por mês crescente e arredonda valor em 2 casas", () => {
  const chamados = [{ Chave: 1 }, { Chave: 2 }];
  const historicoMap = new Map([
    [1, { causa: "Mau uso", dataAprovacao: "2026-08-01", valorAprovacao: 10.005 }],
    [2, { causa: "Mau uso", dataAprovacao: "2026-01-01", valorAprovacao: 10.005 }],
  ]);

  const resultado = buildTendenciaMensalPorCausa(chamados, historicoMap);

  assert.equal(resultado.porMes[0].mes, "2026-01");
  assert.equal(resultado.porMes[1].mes, "2026-08");
  assert.equal(resultado.porMes[0].valor, 10.01);
});
