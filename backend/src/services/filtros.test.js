import { test } from "node:test";
import assert from "node:assert/strict";
import { ampliarParaTras, filtrarPorDataHistorico } from "./filtros.js";

test("ampliarParaTras desloca dataInicio pra trás em N meses, mantendo dataFim", () => {
  const periodo = { dataInicio: "2026-09-01", dataFim: "2026-09-30" };
  assert.deepEqual(ampliarParaTras(periodo, 3), { dataInicio: "2026-06-01", dataFim: "2026-09-30" });
});

test("ampliarParaTras atravessa virada de ano corretamente", () => {
  const periodo = { dataInicio: "2026-01-15", dataFim: "2026-01-31" };
  assert.deepEqual(ampliarParaTras(periodo, 3), { dataInicio: "2025-10-15", dataFim: "2026-01-31" });
});

test("ampliarParaTras sem dataInicio retorna o período sem alteração", () => {
  const periodo = { dataFim: "2026-09-30" };
  assert.deepEqual(ampliarParaTras(periodo, 3), periodo);
});

test("filtrarPorDataHistorico filtra chamados pelo campo indicado do historicoMap", () => {
  const chamados = [{ Chave: "A" }, { Chave: "B" }, { Chave: "C" }];
  const historicoMap = new Map([
    ["A", { dataDecisao: "2026-08-15" }],
    ["B", { dataDecisao: "2026-09-10" }],
    ["C", { dataDecisao: "2026-09-25" }],
  ]);
  const resultado = filtrarPorDataHistorico(chamados, historicoMap, "dataDecisao", {
    dataInicio: "2026-09-01",
    dataFim: "2026-09-30",
  });
  assert.deepEqual(resultado.map((c) => c.Chave), ["B", "C"]);
});

test("filtrarPorDataHistorico exclui chamado sem entrada no historicoMap ou com campo nulo", () => {
  const chamados = [{ Chave: "A" }, { Chave: "B" }];
  const historicoMap = new Map([["A", { dataDecisao: null }]]);
  const resultado = filtrarPorDataHistorico(chamados, historicoMap, "dataDecisao", {
    dataInicio: "2026-09-01",
    dataFim: "2026-09-30",
  });
  assert.deepEqual(resultado, []);
});

test("filtrarPorDataHistorico sem dataInicio/dataFim retorna todos os chamados", () => {
  const chamados = [{ Chave: "A" }, { Chave: "B" }];
  const historicoMap = new Map();
  assert.deepEqual(filtrarPorDataHistorico(chamados, historicoMap, "dataDecisao", {}), chamados);
});

test("filtrarPorDataHistorico respeita os limites (inclusive) de dataInicio e dataFim", () => {
  const chamados = [{ Chave: "A" }, { Chave: "B" }, { Chave: "C" }];
  const historicoMap = new Map([
    ["A", { dataAprovacao: "2026-09-01" }],
    ["B", { dataAprovacao: "2026-09-30" }],
    ["C", { dataAprovacao: "2026-10-01" }],
  ]);
  const resultado = filtrarPorDataHistorico(chamados, historicoMap, "dataAprovacao", {
    dataInicio: "2026-09-01",
    dataFim: "2026-09-30",
  });
  assert.deepEqual(resultado.map((c) => c.Chave), ["A", "B"]);
});
