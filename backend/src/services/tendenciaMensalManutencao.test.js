import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTendenciaMensal } from "./tendenciaMensalManutencao.js";

function chamado(overrides) {
  return { Chave: 1, DataCriacao: "2026-08-01", tipo: "Preventiva", ...overrides };
}

test("buildTendenciaMensal agrupa por mês (AAAA-MM) a partir de DataCriacao", () => {
  const chamados = [chamado({ Chave: 1, DataCriacao: "2026-08-05" }), chamado({ Chave: 2, DataCriacao: "2026-08-20" })];
  const historicoMap = new Map([
    [1, { valorAprovacao: 100, tempoAguardandoPecaDias: 0 }],
    [2, { valorAprovacao: 50, tempoAguardandoPecaDias: 0 }],
  ]);
  const resultado = buildTendenciaMensal(chamados, historicoMap);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].mes, "2026-08");
});

test("buildTendenciaMensal soma valorPreventiva e valorCorretiva separadamente", () => {
  const chamados = [
    chamado({ Chave: 1, tipo: "Preventiva", DataCriacao: "2026-08-01" }),
    chamado({ Chave: 2, tipo: "Corretiva", DataCriacao: "2026-08-05" }),
    chamado({ Chave: 3, tipo: "Corretiva", DataCriacao: "2026-08-10" }),
  ];
  const historicoMap = new Map([
    [1, { valorAprovacao: 100, tempoAguardandoPecaDias: 0 }],
    [2, { valorAprovacao: 50, tempoAguardandoPecaDias: 0 }],
    [3, { valorAprovacao: 30, tempoAguardandoPecaDias: 0 }],
  ]);
  const [resultado] = buildTendenciaMensal(chamados, historicoMap);
  assert.equal(resultado.valorPreventiva, 100);
  assert.equal(resultado.valorCorretiva, 80);
});

test("buildTendenciaMensal soma tempoAguardandoPecaDias de qualquer tipo", () => {
  const chamados = [
    chamado({ Chave: 1, tipo: "Preventiva", DataCriacao: "2026-08-01" }),
    chamado({ Chave: 2, tipo: "Corretiva", DataCriacao: "2026-08-05" }),
  ];
  const historicoMap = new Map([
    [1, { valorAprovacao: 0, tempoAguardandoPecaDias: 2 }],
    [2, { valorAprovacao: 0, tempoAguardandoPecaDias: 1.5 }],
  ]);
  const [resultado] = buildTendenciaMensal(chamados, historicoMap);
  assert.equal(resultado.tempoAguardandoPecaDias, 3.5);
});

test("buildTendenciaMensal ordena por mês ascendente", () => {
  const chamados = [
    chamado({ Chave: 1, DataCriacao: "2026-09-01" }),
    chamado({ Chave: 2, DataCriacao: "2026-07-01" }),
    chamado({ Chave: 3, DataCriacao: "2026-08-01" }),
  ];
  const historicoMap = new Map([
    [1, { valorAprovacao: 0, tempoAguardandoPecaDias: 0 }],
    [2, { valorAprovacao: 0, tempoAguardandoPecaDias: 0 }],
    [3, { valorAprovacao: 0, tempoAguardandoPecaDias: 0 }],
  ]);
  const resultado = buildTendenciaMensal(chamados, historicoMap);
  assert.deepEqual(resultado.map((r) => r.mes), ["2026-07", "2026-08", "2026-09"]);
});

test("buildTendenciaMensal ignora chamado sem DataCriacao", () => {
  const chamados = [chamado({ Chave: 1, DataCriacao: null })];
  const historicoMap = new Map([[1, { valorAprovacao: 100, tempoAguardandoPecaDias: 0 }]]);
  assert.deepEqual(buildTendenciaMensal(chamados, historicoMap), []);
});

test("buildTendenciaMensal usa 0 quando historicoMap não tem entrada pro chamado", () => {
  const chamados = [chamado({ Chave: 1, tipo: "Preventiva", DataCriacao: "2026-08-01" })];
  const historicoMap = new Map();
  const [resultado] = buildTendenciaMensal(chamados, historicoMap);
  assert.equal(resultado.valorPreventiva, 0);
  assert.equal(resultado.tempoAguardandoPecaDias, 0);
});
