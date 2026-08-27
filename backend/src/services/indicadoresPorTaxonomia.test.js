import { test } from "node:test";
import assert from "node:assert/strict";
import { agruparEquipamentos, buildIndicadoresManutencao, buildIndicadoresEngenharia, buildCondenados } from "./indicadoresPorTaxonomia.js";

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

test("buildIndicadoresManutencao conta condenados (status 'Condenado e Laudo Anexo (Atenção)') em geral e por tipo", () => {
  const chamados = [
    { tipo: "Corretiva", NomeStatus: "Condenado e Laudo Anexo (Atenção)" },
    { tipo: "Corretiva", NomeStatus: "Resolvido" },
    { tipo: "Preventiva", NomeStatus: "Condenado e Laudo Anexo (Atenção)" },
  ];

  const resultado = buildIndicadoresManutencao(chamados);

  assert.equal(resultado.geral.condenado, 2);
  assert.equal(resultado.porTipoDetalhe["Corretiva"].condenado, 1);
  assert.equal(resultado.porTipoDetalhe["Preventiva"].condenado, 1);
  assert.equal(resultado.porTipoDetalhe["Rotina"].condenado, 0);
});

test("buildIndicadoresManutencao conta aguardandoPeca (2 status: 'Aguardando Peça do Estoque' e 'Peça Enviada para Loja') em geral e por tipo", () => {
  const chamados = [
    { tipo: "Corretiva", NomeStatus: "Aguardando Peça do Estoque" },
    { tipo: "Corretiva", NomeStatus: "Peça Enviada para Loja" },
    { tipo: "Corretiva", NomeStatus: "Resolvido" },
    { tipo: "Preventiva", NomeStatus: "Aguardando Peça do Estoque" },
  ];

  const resultado = buildIndicadoresManutencao(chamados);

  assert.equal(resultado.geral.aguardandoPeca, 3);
  assert.equal(resultado.porTipoDetalhe["Corretiva"].aguardandoPeca, 2);
  assert.equal(resultado.porTipoDetalhe["Preventiva"].aguardandoPeca, 1);
  assert.equal(resultado.porTipoDetalhe["Rotina"].aguardandoPeca, 0);
});

test("buildCondenados filtra pelo status, calcula diasParado e junta causa/ics do histórico", () => {
  const chamados = [
    {
      Chave: 1,
      CodChamado: "0826-000001",
      Assunto: "Empilhadeira quebrada",
      cliente: "Loja A",
      especialidade: "Manutenção",
      uf: "MG",
      NomeOperador: "Ana",
      SobrenomeOperador: "Silva",
      DataCriacao: "2026-08-01",
      NomeStatus: "Condenado e Laudo Anexo (Atenção)",
    },
    {
      Chave: 2,
      CodChamado: "0826-000002",
      Assunto: "Poste danificado",
      cliente: "Loja B",
      especialidade: "Engenharia",
      uf: "BA",
      NomeOperador: null,
      SobrenomeOperador: null,
      DataCriacao: "2026-08-20",
      NomeStatus: "Condenado e Laudo Anexo (Atenção)",
    },
    {
      Chave: 3,
      CodChamado: "0826-000003",
      Assunto: "Outro chamado, não condenado",
      cliente: "Loja C",
      especialidade: "Manutenção",
      uf: "MG",
      DataCriacao: "2026-08-01",
      NomeStatus: "Resolvido",
    },
  ];
  const historicoMap = new Map([[1, { causa: "Desgaste Natural", ics: ["25 - Empilhadeira 02"] }]]);

  const resultado = buildCondenados(chamados, historicoMap, { hoje: new Date("2026-08-26T12:00:00") });

  assert.equal(resultado.total, 2);
  assert.equal(resultado.diasParadoMaisAntigo, 25);
  assert.deepEqual(
    resultado.itens.map((i) => i.codChamado),
    ["0826-000001", "0826-000002"]
  );

  const item1 = resultado.itens[0];
  assert.equal(item1.diasParado, 25);
  assert.equal(item1.causa, "Desgaste Natural");
  assert.deepEqual(item1.ics, ["25 - Empilhadeira 02"]);
  assert.equal(item1.operador, "Ana Silva");
  assert.equal(item1.cliente, "Loja A");
  assert.equal(item1.especialidade, "Manutenção");

  const item2 = resultado.itens[1];
  assert.equal(item2.diasParado, 6);
  assert.equal(item2.causa, null);
  assert.deepEqual(item2.ics, []);
  assert.equal(item2.operador, "Sem operador");
});

test("buildCondenados retorna total 0 e diasParadoMaisAntigo null sem nenhum condenado", () => {
  const resultado = buildCondenados([{ NomeStatus: "Resolvido" }], new Map());
  assert.deepEqual(resultado, { total: 0, diasParadoMaisAntigo: null, itens: [] });
});
