import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSubCategoriaIndex } from "./subcategorias.js";

const AMOSTRA_REAL = [
  { Chave: 8158, Sequencia: "005529", SubCategoria: "Disjuntor desarmando", Categoria: "Engenharia - Elétrica" },
  { Chave: 16744, Sequencia: "005705", SubCategoria: "Bebedouro", Categoria: "Manutenção - Equipamentos" },
  { Chave: 8609, Sequencia: "005651", SubCategoria: "Gerador - Quinzenal", Categoria: "Manutenção - Rotinas" },
];

test("buildSubCategoriaIndex indexa por Sequencia", () => {
  const index = buildSubCategoriaIndex(AMOSTRA_REAL);

  assert.equal(index.size, 3);
  assert.deepEqual(index.get("005705"), {
    Chave: 16744,
    Sequencia: "005705",
    SubCategoria: "Bebedouro",
    Categoria: "Manutenção - Equipamentos",
  });
});

test("buildSubCategoriaIndex retorna Map vazio para lista vazia", () => {
  const index = buildSubCategoriaIndex([]);
  assert.equal(index.size, 0);
});

test("buildSubCategoriaIndex ignora entradas sem Sequencia", () => {
  const index = buildSubCategoriaIndex([{ SubCategoria: "Lixo", Categoria: "X" }]);
  assert.equal(index.size, 0);
});
