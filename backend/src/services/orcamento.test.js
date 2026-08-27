import { test } from "node:test";
import assert from "node:assert/strict";
import { buildResumoRapidoOrcamento, buildOrcamento, foiReprovado, buildPorLojaOrcamento } from "./orcamento.js";

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

const CONFIG_TESTE = {
  grupos: ["Movimentação", "Refrigeração"],
  atribuicoes: { "empilhadeira": "Movimentação", "camara de resfriado": "Refrigeração" },
};

test("buildPorLojaOrcamento agrupa loja > especialidade > categoria > equipamento e separa aprovado/pendente/reprovado", () => {
  const chamados = [
    { Chave: 1, NomeStatus: "Resolvido", especialidade: "Manutenção", equipamento: "Empilhadeira", cliente: "Loja A", uf: "SP" },
    { Chave: 2, NomeStatus: "Aguardando Aprovação", especialidade: "Manutenção", equipamento: "Empilhadeira", cliente: "Loja A", uf: "SP" },
    { Chave: 3, NomeStatus: "Orçamento Reprovado", especialidade: "Manutenção", equipamento: "Camara de Resfriado", cliente: "Loja A", uf: "SP" },
    { Chave: 4, NomeStatus: "Resolvido", especialidade: "Engenharia", tipoAtividade: "Elétrica", cliente: "Loja A", uf: "SP" },
    { Chave: 5, NomeStatus: "Resolvido", especialidade: "Manutenção", equipamento: "Bebedouro", cliente: "Loja B", uf: "MG" },
  ];
  const historicoMap = new Map([
    [1, { passouPorAguardandoAprovacao: true, valorAprovacao: 100 }],
    [2, { passouPorAguardandoAprovacao: false, valorAprovacao: 50 }],
    [3, { passouPorAguardandoAprovacao: true, valorAprovacao: 300 }],
    [4, { passouPorAguardandoAprovacao: true, valorAprovacao: 400 }],
    [5, { passouPorAguardandoAprovacao: true, valorAprovacao: 10 }],
  ]);

  const resultado = buildPorLojaOrcamento(chamados, historicoMap, CONFIG_TESTE);

  // Loja A (aprovado 500 + pendente 50 = 550) vem antes de Loja B (aprovado 10) — reprovado
  // (300) não conta pro total usado na ordenação.
  assert.equal(resultado[0].cliente, "Loja A");
  assert.equal(resultado[0].uf, "SP");
  assert.deepEqual(resultado[0].aprovado, { total: 2, valor: 500 });
  assert.deepEqual(resultado[0].pendente, { total: 1, valor: 50 });
  assert.deepEqual(resultado[0].reprovado, { total: 1, valor: 300 });

  const manutencaoA = resultado[0].porEspecialidade.find((e) => e.especialidade === "Manutenção");
  assert.deepEqual(manutencaoA.aprovado, { total: 1, valor: 100 });
  assert.deepEqual(manutencaoA.pendente, { total: 1, valor: 50 });
  assert.deepEqual(manutencaoA.reprovado, { total: 1, valor: 300 });

  const movimentacao = manutencaoA.porCategoria.find((c) => c.categoria === "Movimentação");
  assert.deepEqual(movimentacao.aprovado, { total: 1, valor: 100 });
  assert.deepEqual(movimentacao.pendente, { total: 1, valor: 50 });
  assert.ok(Array.isArray(movimentacao.porEquipamento), "Manutenção deve ter porEquipamento");
  assert.equal(movimentacao.porEquipamento[0].equipamento, "Empilhadeira");
  assert.deepEqual(movimentacao.porEquipamento[0].aprovado, { total: 1, valor: 100 });
  assert.deepEqual(movimentacao.porEquipamento[0].pendente, { total: 1, valor: 50 });

  const refrigeracao = manutencaoA.porCategoria.find((c) => c.categoria === "Refrigeração");
  assert.deepEqual(refrigeracao.reprovado, { total: 1, valor: 300 });
  assert.deepEqual(refrigeracao.aprovado, { total: 0, valor: 0 });

  const engenhariaA = resultado[0].porEspecialidade.find((e) => e.especialidade === "Engenharia");
  assert.deepEqual(engenhariaA.aprovado, { total: 1, valor: 400 });
  const eletrica = engenhariaA.porCategoria.find((c) => c.categoria === "Elétrica");
  assert.equal(eletrica.porEquipamento, undefined, "Engenharia não deve ter porEquipamento");

  const lojaB = resultado.find((l) => l.cliente === "Loja B");
  const manutencaoB = lojaB.porEspecialidade[0];
  const naoClassificado = manutencaoB.porCategoria.find((c) => c.categoria === "Não classificado");
  assert.ok(naoClassificado, "equipamento sem grupo configurado (Bebedouro) cai em 'Não classificado'");
});

test("buildPorLojaOrcamento retorna array vazio pra lista de chamados vazia", () => {
  assert.deepEqual(buildPorLojaOrcamento([], new Map(), CONFIG_TESTE), []);
});
