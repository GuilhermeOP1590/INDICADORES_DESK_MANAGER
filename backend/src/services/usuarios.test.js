import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClientePorUsuario, buildCodigoClientePorUsuario, buildNomePorUsuario } from "./usuarios.js";

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

test("buildCodigoClientePorUsuario mapeia Chave do usuário para CodigoCliente", () => {
  const mapa = buildCodigoClientePorUsuario(AMOSTRA_REAL);

  assert.equal(mapa.size, 2);
  assert.equal(mapa.get(20), 3);
  assert.equal(mapa.get(586), 36);
});

test("buildNomePorUsuario junta Nome e Sobrenome do solicitante", () => {
  const mapa = buildNomePorUsuario([
    ...AMOSTRA_REAL,
    { Chave: 900, CodigoCliente: 3, Cliente: "CD 300", Nome: "Marcia", Sobrenome: "" },
    { Chave: 901, CodigoCliente: 3, Cliente: "CD 300" },
  ]);

  assert.equal(mapa.get(20), "Leony Silva");
  assert.equal(mapa.get(586), "Jose Carlos");
  assert.equal(mapa.get(900), "Marcia");
  assert.equal(mapa.get(901), null);
});
