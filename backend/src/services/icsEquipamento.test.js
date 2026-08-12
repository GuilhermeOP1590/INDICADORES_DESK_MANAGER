import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPorIc } from "./icsEquipamento.js";

function chamado(overrides) {
  return { Chave: 1, CodChamado: "0000-000001", DataCriacao: "2026-08-01", tipo: "Preventiva", cliente: null, ...overrides };
}

test("buildPorIc agrupa por Ic e conta total corretamente", () => {
  const chamados = [
    chamado({ Chave: 1, CodChamado: "0000-000001" }),
    chamado({ Chave: 2, CodChamado: "0000-000002" }),
  ];
  const historicoMap = new Map([
    [1, { ics: ["Empilhadeira 06"], horimetro: "1000", causa: null, valorAprovacao: null }],
    [2, { ics: ["Empilhadeira 06"], horimetro: "1050", causa: null, valorAprovacao: null }],
  ]);

  const resultado = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].ic, "Empilhadeira 06");
  assert.equal(resultado[0].total, 2);
});

test("buildPorIc ignora chamados sem Ic no histórico", () => {
  const chamados = [chamado({ Chave: 1 })];
  const historicoMap = new Map([[1, { ics: [], horimetro: null, causa: null, valorAprovacao: null }]]);
  assert.deepEqual(buildPorIc(chamados, historicoMap), []);
});

test("buildPorIc conta um chamado com 2 Ics nos dois grupos", () => {
  const chamados = [chamado({ Chave: 1 })];
  const historicoMap = new Map([[1, { ics: ["Ic A", "Ic B"], horimetro: null, causa: null, valorAprovacao: null }]]);
  const resultado = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.length, 2);
  assert.deepEqual(resultado.map((r) => r.ic).sort(), ["Ic A", "Ic B"]);
});

test("buildPorIc soma custoTotal e conta preventiva/corretiva por tipo", () => {
  const chamados = [
    chamado({ Chave: 1, tipo: "Preventiva" }),
    chamado({ Chave: 2, tipo: "Corretiva" }),
    chamado({ Chave: 3, tipo: "Corretiva" }),
  ];
  const historicoMap = new Map([
    [1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: 100 }],
    [2, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: 50 }],
    [3, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }],
  ]);

  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.preventiva, 1);
  assert.equal(resultado.corretiva, 2);
  assert.equal(resultado.custoTotal, 150);
});

test("buildPorIc calcula recorrenciaDias como o intervalo médio entre datas consecutivas", () => {
  const chamados = [
    chamado({ Chave: 1, DataCriacao: "2026-08-01" }),
    chamado({ Chave: 2, DataCriacao: "2026-08-11" }),
    chamado({ Chave: 3, DataCriacao: "2026-08-21" }),
  ];
  const historicoMap = new Map([
    [1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }],
    [2, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }],
    [3, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }],
  ]);

  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.recorrenciaDias, 10);
});

test("buildPorIc retorna recorrenciaDias null com só 1 chamado", () => {
  const chamados = [chamado({ Chave: 1 })];
  const historicoMap = new Map([[1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }]]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.recorrenciaDias, null);
});

test("buildPorIc usa o cliente mais frequente do histórico do Ic", () => {
  const chamados = [
    chamado({ Chave: 1, cliente: "Loja A" }),
    chamado({ Chave: 2, cliente: "Loja A" }),
    chamado({ Chave: 3, cliente: "Loja B" }),
  ];
  const historicoMap = new Map([
    [1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }],
    [2, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }],
    [3, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }],
  ]);

  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.cliente, "Loja A");
});

test("buildPorIc retorna cliente null quando nenhum chamado tem cliente identificado", () => {
  const chamados = [chamado({ Chave: 1, cliente: null })];
  const historicoMap = new Map([[1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }]]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.cliente, null);
});

test("buildPorIc ordena por total desc", () => {
  const chamados = [
    chamado({ Chave: 1 }),
    chamado({ Chave: 2 }),
    chamado({ Chave: 3 }),
  ];
  const historicoMap = new Map([
    [1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }],
    [2, { ics: ["Ic B"], horimetro: null, causa: null, valorAprovacao: null }],
    [3, { ics: ["Ic B"], horimetro: null, causa: null, valorAprovacao: null }],
  ]);
  const resultado = buildPorIc(chamados, historicoMap);
  assert.equal(resultado[0].ic, "Ic B");
  assert.equal(resultado[0].total, 2);
});
