import { test } from "node:test";
import assert from "node:assert/strict";
import { agruparEquipamentos, buildIndicadoresManutencao, buildIndicadoresEngenharia } from "./indicadoresPorTaxonomia.js";

const CONFIG_TESTE = {
  grupos: ["Movimentação", "Refrigeração"],
  atribuicoes: { "empilhadeira": "Movimentação", "camara de resfriado": "Refrigeração" },
};

test("agruparEquipamentos agrupa pelo grupo configurado e aninha o ranking por equipamento", () => {
  const chamados = [
    { equipamento: "Empilhadeira" },
    { equipamento: "Empilhadeira" },
    { equipamento: "Camara de Resfriado" },
    { equipamento: "Bebedouro" },
  ];

  const resultado = agruparEquipamentos(chamados, CONFIG_TESTE);

  assert.deepEqual(resultado, [
    { label: "Movimentação", total: 2, itens: [{ label: "Empilhadeira", total: 2 }] },
    { label: "Refrigeração", total: 1, itens: [{ label: "Camara de Resfriado", total: 1 }] },
    { label: "Não classificado", total: 1, itens: [{ label: "Bebedouro", total: 1 }] },
  ]);
});

test("agruparEquipamentos ignora chamados sem equipamento (caso Engenharia)", () => {
  const chamados = [{ equipamento: null }, { equipamento: "Empilhadeira" }];
  const resultado = agruparEquipamentos(chamados, CONFIG_TESTE);
  assert.deepEqual(resultado, [{ label: "Movimentação", total: 1, itens: [{ label: "Empilhadeira", total: 1 }] }]);
});

test("buildIndicadoresManutencao inclui porGrupoEquipamento em geral e em cada tipo", () => {
  const chamados = [{ tipo: "Corretiva", equipamento: "Empilhadeira", NomeStatus: "Resolvido" }];
  const resultado = buildIndicadoresManutencao(chamados);
  assert.ok(Array.isArray(resultado.geral.porGrupoEquipamento));
  assert.ok(Array.isArray(resultado.porTipoDetalhe["Corretiva"].porGrupoEquipamento));
});

test("buildIndicadoresEngenharia não inclui porGrupoEquipamento (Engenharia não tem equipamento)", () => {
  const chamados = [{ tipoAtividade: "Elétrica", equipamento: null, NomeStatus: "Resolvido" }];
  const resultado = buildIndicadoresEngenharia(chamados);
  assert.equal(resultado.geral.porGrupoEquipamento, undefined);
  assert.equal(resultado.porAtividadeDetalhe["Elétrica"].porGrupoEquipamento, undefined);
});

// "Orçamento Reprovado" não está em nenhum dos 3 baldes configurados por padrão
// (configuracaoIndicadores.js#PADRAO) — cai em "outro", rotulado "Ignorar (não entra nos
// indicadores de status)" na UI de Configurações > Status.
test("buildIndicadoresManutencao exclui status 'outro' de abertos/concluidos em operadores/porUf/porClienteDetalhado", () => {
  const chamados = [
    { tipo: "Corretiva", NomeOperador: "Ana", SobrenomeOperador: "Silva", uf: "SP", cliente: "Loja A", NomeStatus: "Resolvido" },
    {
      tipo: "Corretiva",
      NomeOperador: "Ana",
      SobrenomeOperador: "Silva",
      uf: "SP",
      cliente: "Loja A",
      NomeStatus: "Orçamento Reprovado",
    },
  ];

  const resultado = buildIndicadoresManutencao(chamados);

  const operador = resultado.geral.operadores.find((o) => o.operador === "Ana Silva");
  assert.equal(operador.total, 2);
  assert.equal(operador.concluidos, 1);
  assert.equal(operador.abertos, 0);
  assert.equal(operador.percentualResolucao, 100);

  const uf = resultado.geral.porUf.find((u) => u.uf === "SP");
  assert.equal(uf.abertos, 0);

  const cliente = resultado.geral.porClienteDetalhado.find((c) => c.cliente === "Loja A");
  assert.equal(cliente.abertos, 0);
});
