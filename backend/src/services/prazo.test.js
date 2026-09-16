import { test } from "node:test";
import assert from "node:assert/strict";
import { classificarPrazo } from "./prazo.js";

const HOJE = new Date(2026, 8, 16); // quarta-feira, 16/09/2026

test("classificarPrazo retorna 'atrasado' pra data prevista no passado", () => {
  assert.equal(classificarPrazo("2026-09-10", HOJE), "atrasado");
});

test("classificarPrazo retorna 'vence-semana' pra hoje mesmo (não é atrasado)", () => {
  assert.equal(classificarPrazo("2026-09-16", HOJE), "vence-semana");
});

test("classificarPrazo retorna 'vence-semana' pro último dia da semana de calendário (domingo)", () => {
  assert.equal(classificarPrazo("2026-09-20", HOJE), "vence-semana");
});

test("classificarPrazo retorna 'no-prazo' pra data da semana seguinte", () => {
  assert.equal(classificarPrazo("2026-09-21", HOJE), "no-prazo");
});

test("classificarPrazo retorna 'sem-data' quando não há data prevista", () => {
  assert.equal(classificarPrazo(null, HOJE), "sem-data");
  assert.equal(classificarPrazo(undefined, HOJE), "sem-data");
  assert.equal(classificarPrazo("", HOJE), "sem-data");
});
