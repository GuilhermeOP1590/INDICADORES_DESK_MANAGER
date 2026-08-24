import { test } from "node:test";
import assert from "node:assert/strict";
import { buildResumoRapidoOrcamento } from "./orcamento.js";

test("buildResumoRapidoOrcamento conta total e aguardando aprovação sem depender de histórico", () => {
  const chamados = [
    { NomeStatus: "Aguardando Aprovação" },
    { NomeStatus: "Aguardando Aprovação" },
    { NomeStatus: "Resolvido" },
    { NomeStatus: "Em Andamento" },
  ];

  assert.deepEqual(buildResumoRapidoOrcamento(chamados), { totalChamados: 4, aguardandoTotal: 2 });
});

test("buildResumoRapidoOrcamento retorna zeros pra lista vazia", () => {
  assert.deepEqual(buildResumoRapidoOrcamento([]), { totalChamados: 0, aguardandoTotal: 0 });
});
