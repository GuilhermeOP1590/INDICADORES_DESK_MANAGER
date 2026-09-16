import { test } from "node:test";
import assert from "node:assert/strict";
import { grupoDaPessoa, deveCriarGrupo } from "./pcmPessoas.js";

test("grupoDaPessoa retorna o grupo mapeado", () => {
  const mapa = new Map([["Nadson da Conceição", "Manutenção"]]);
  assert.equal(grupoDaPessoa("Nadson da Conceição", mapa), "Manutenção");
});

test("grupoDaPessoa retorna null quando a pessoa não está mapeada", () => {
  assert.equal(grupoDaPessoa("Fulano de Tal", new Map()), null);
});

test("grupoDaPessoa retorna null pra pessoa vazia ou nula", () => {
  assert.equal(grupoDaPessoa(null, new Map()), null);
  assert.equal(grupoDaPessoa("", new Map()), null);
});

test("deveCriarGrupo aceita nome novo e não vazio", () => {
  assert.equal(deveCriarGrupo(["Manutenção"], "Engenharia"), true);
});

test("deveCriarGrupo rejeita nome vazio ou só espaço", () => {
  assert.equal(deveCriarGrupo(["Manutenção"], "   "), false);
});

test("deveCriarGrupo rejeita duplicata exata", () => {
  assert.equal(deveCriarGrupo(["Manutenção"], "Manutenção"), false);
});
