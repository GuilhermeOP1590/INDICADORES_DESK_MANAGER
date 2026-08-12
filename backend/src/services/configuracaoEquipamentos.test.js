import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarEquipamento, grupoDoEquipamento } from "./configuracaoEquipamentos.js";

test("normalizarEquipamento remove espaços extras nas bordas e no meio, e usa minúsculo", () => {
  assert.equal(normalizarEquipamento("Ar  condicionado Central"), "ar condicionado central");
  assert.equal(normalizarEquipamento("  Empilhadeira  "), "empilhadeira");
});

test("grupoDoEquipamento retorna o grupo configurado pra uma chave conhecida", () => {
  const config = { grupos: ["Movimentação"], atribuicoes: { "empilhadeira": "Movimentação" } };
  assert.equal(grupoDoEquipamento("Empilhadeira", config), "Movimentação");
});

test("grupoDoEquipamento casa por chave normalizada (espaço duplo e maiúscula não importam)", () => {
  const config = { grupos: ["Climatização"], atribuicoes: { "ar condicionado central": "Climatização" } };
  assert.equal(grupoDoEquipamento("Ar  condicionado Central", config), "Climatização");
});

test("grupoDoEquipamento retorna 'Não classificado' quando a chave não está no mapeamento", () => {
  const config = { grupos: [], atribuicoes: {} };
  assert.equal(grupoDoEquipamento("Bebedouro", config), "Não classificado");
});

test("grupoDoEquipamento retorna null quando não há equipamento", () => {
  const config = { grupos: [], atribuicoes: {} };
  assert.equal(grupoDoEquipamento(null, config), null);
  assert.equal(grupoDoEquipamento(undefined, config), null);
});
