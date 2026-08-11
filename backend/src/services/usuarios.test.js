import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClientePorUsuario } from "./usuarios.js";

const AMOSTRA_REAL = [
  { Chave: 20, CodigoCliente: 3, Cliente: "CD 300", Nome: "Leony", Sobrenome: "Silva" },
  { Chave: 586, CodigoCliente: 36, Cliente: "PORTO SEGURO", Nome: "Jose", Sobrenome: "Carlos" },
];

test("buildClientePorUsuario mapeia Chave do usuário para nome do Cliente", () => {
  const mapa = buildClientePorUsuario(AMOSTRA_REAL);

  assert.equal(mapa.size, 2);
  assert.equal(mapa.get(20), "CD 300");
  assert.equal(mapa.get(586), "PORTO SEGURO");
});

test("buildClientePorUsuario retorna Map vazio para lista vazia", () => {
  assert.equal(buildClientePorUsuario([]).size, 0);
});
