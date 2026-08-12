import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicarUpsert, aplicarRemocao } from "./prioridades.js";

test("aplicarUpsert adiciona um código novo com nota e data", () => {
  const antes = { chamados: [] };
  const depois = aplicarUpsert(antes, "0726-001231", "cliente cobrando");
  assert.equal(depois.chamados.length, 1);
  assert.equal(depois.chamados[0].codChamado, "0726-001231");
  assert.equal(depois.chamados[0].nota, "cliente cobrando");
  assert.ok(depois.chamados[0].adicionadoEm);
});

test("aplicarUpsert remove espaços nas bordas do código", () => {
  const depois = aplicarUpsert({ chamados: [] }, "  0726-001231  ", "");
  assert.equal(depois.chamados[0].codChamado, "0726-001231");
});

test("aplicarUpsert atualiza a nota de um código já existente, sem duplicar", () => {
  const antes = {
    chamados: [{ codChamado: "0726-001231", nota: "nota antiga", adicionadoEm: "2026-08-01T00:00:00.000Z" }],
  };
  const depois = aplicarUpsert(antes, "0726-001231", "nota nova");
  assert.equal(depois.chamados.length, 1);
  assert.equal(depois.chamados[0].nota, "nota nova");
  assert.equal(depois.chamados[0].adicionadoEm, "2026-08-01T00:00:00.000Z");
});

test("aplicarRemocao tira o código da lista", () => {
  const antes = { chamados: [{ codChamado: "0726-001231", nota: "", adicionadoEm: "2026-08-01T00:00:00.000Z" }] };
  const depois = aplicarRemocao(antes, "0726-001231");
  assert.equal(depois.chamados.length, 0);
});

test("aplicarRemocao não faz nada se o código não está na lista", () => {
  const antes = { chamados: [{ codChamado: "0726-001231", nota: "", adicionadoEm: "2026-08-01T00:00:00.000Z" }] };
  const depois = aplicarRemocao(antes, "9999-999999");
  assert.equal(depois.chamados.length, 1);
});
