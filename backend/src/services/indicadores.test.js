import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIndicadores } from "./indicadores.js";

// "Orçamento Reprovado" não está em nenhum dos 3 baldes configurados por padrão
// (configuracaoIndicadores.js#PADRAO) — cai em "outro", que na UI de Configurações > Status é
// rotulado "Ignorar (não entra nos indicadores de status)".
test("buildIndicadores exclui status 'outro' de abertos/concluidos em operadores/porUf/porCliente", () => {
  const chamados = [
    {
      tipo: "Corretiva",
      NomeOperador: "Ana",
      SobrenomeOperador: "Silva",
      uf: "SP",
      cliente: "Loja A",
      NomeStatus: "Resolvido",
    },
    {
      tipo: "Corretiva",
      NomeOperador: "Ana",
      SobrenomeOperador: "Silva",
      uf: "SP",
      cliente: "Loja A",
      NomeStatus: "Orçamento Reprovado",
    },
  ];

  const resultado = buildIndicadores(chamados);

  const operador = resultado.operadores.find((o) => o.operador === "Ana Silva");
  assert.equal(operador.total, 2);
  assert.equal(operador.concluidos, 1);
  assert.equal(operador.abertos, 0);
  assert.equal(operador.percentualResolucao, 100);

  const uf = resultado.porUf.find((u) => u.uf === "SP");
  assert.equal(uf.abertos, 0);
  assert.equal(uf.percentualResolucao, 100);

  const cliente = resultado.porCliente.find((c) => c.cliente === "Loja A");
  assert.equal(cliente.abertos, 0);
  assert.equal(cliente.percentualResolucao, 100);
});

test("buildIndicadores conta status 'aberto' normalmente (não é afetado pela exclusão de 'outro')", () => {
  const chamados = [
    { tipo: "Corretiva", NomeOperador: "Ana", SobrenomeOperador: "Silva", uf: "SP", cliente: "Loja A", NomeStatus: "Em Andamento" },
  ];

  const resultado = buildIndicadores(chamados);
  const operador = resultado.operadores.find((o) => o.operador === "Ana Silva");
  assert.equal(operador.abertos, 1);
  assert.equal(operador.percentualResolucao, 0);
});
