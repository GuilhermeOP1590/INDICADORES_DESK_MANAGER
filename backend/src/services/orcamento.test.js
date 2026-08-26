import { test } from "node:test";
import assert from "node:assert/strict";
import { buildResumoRapidoOrcamento, buildOrcamento, foiReprovado } from "./orcamento.js";

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

test("foiReprovado identifica pelo NomeStatus exato 'Orçamento Reprovado'", () => {
  assert.equal(foiReprovado({ NomeStatus: "Orçamento Reprovado" }), true);
  assert.equal(foiReprovado({ NomeStatus: "Resolvido" }), false);
});

test("buildOrcamento não soma orçamento reprovado como valor aprovado — reporta em bucket separado", () => {
  const chamados = [
    { Chave: 1, NomeStatus: "Resolvido", especialidade: "Manutenção", tipo: "Corretiva", uf: "SP", cliente: "Loja A" },
    { Chave: 2, NomeStatus: "Orçamento Reprovado", especialidade: "Manutenção", tipo: "Corretiva", uf: "SP", cliente: "Loja A" },
    { Chave: 3, NomeStatus: "Aguardando Aprovação", especialidade: "Manutenção", tipo: "Corretiva", uf: "SP", cliente: "Loja B" },
  ];
  const historicoMap = new Map([
    [1, { passouPorAguardandoAprovacao: true, valorAprovacao: 100, causa: "Desgaste Natural", dataAprovacao: "2026-08-10" }],
    [2, { passouPorAguardandoAprovacao: true, valorAprovacao: 300, causa: "Mau Uso", dataAprovacao: "2026-08-11" }],
    [3, { passouPorAguardandoAprovacao: false, valorAprovacao: 50, causa: null, dataAprovacao: null }],
  ]);

  const resultado = buildOrcamento(chamados, historicoMap);

  assert.deepEqual(resultado.avaliados, { total: 1, valor: 100 });
  assert.deepEqual(resultado.reprovados, { total: 1, valor: 300 });
  assert.deepEqual(resultado.aguardando, { total: 1, valor: 50 });
  // O reprovado (Chave 2, causa "Mau Uso") não pode aparecer num agrupamento que representa
  // custo aprovado — só "Desgaste Natural" (Chave 1) deve sobrar.
  assert.deepEqual(resultado.porCausa, [{ label: "Desgaste Natural", total: 1, valor: 100 }]);
  // porTipo soma aguardando+avaliados (sem reprovado): 50 (aguardando) + 100 (avaliado) = 150.
  assert.equal(resultado.porTipo[0].aguardandoValor + resultado.porTipo[0].avaliadosValor, 150);
  // Histórico de aprovações é só aprovação de verdade — mesmo com dataAprovacao preenchida,
  // o reprovado (Chave 2) não pode aparecer na lista.
  assert.equal(resultado.historicoAprovacoes.length, 1);
  assert.equal(resultado.historicoAprovacoes[0].chave, 1);
});
