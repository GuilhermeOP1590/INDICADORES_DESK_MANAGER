import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPorIc } from "./icsEquipamento.js";

function chamado(overrides) {
  return {
    Chave: 1,
    CodChamado: "0000-000001",
    DataCriacao: "2026-08-01",
    HoraCriacao: "08:00:00",
    DataFinalizacao: null,
    HoraFinalizacao: null,
    tipo: "Preventiva",
    cliente: null,
    NomeStatus: null,
    ...overrides,
  };
}

test("buildPorIc agrupa por Ic e conta total corretamente", () => {
  const chamados = [
    chamado({ Chave: 1, CodChamado: "0000-000001" }),
    chamado({ Chave: 2, CodChamado: "0000-000002" }),
  ];
  const historicoMap = new Map([
    [1, { ics: ["Empilhadeira 06"], horimetro: "1000", causa: null, valorAprovacao: null }],
    [2, { ics: ["Empilhadeira 06"], horimetro: "1050", causa: null, valorAprovacao: null }],
  ]);

  const resultado = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].ic, "Empilhadeira 06");
  assert.equal(resultado[0].total, 2);
});

test("buildPorIc ignora chamados sem Ic no histórico", () => {
  const chamados = [chamado({ Chave: 1 })];
  const historicoMap = new Map([[1, { ics: [], horimetro: null, causa: null, valorAprovacao: null }]]);
  assert.deepEqual(buildPorIc(chamados, historicoMap), []);
});

test("buildPorIc conta um chamado com 2 Ics nos dois grupos", () => {
  const chamados = [chamado({ Chave: 1 })];
  const historicoMap = new Map([[1, { ics: ["Ic A", "Ic B"], horimetro: null, causa: null, valorAprovacao: null }]]);
  const resultado = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.length, 2);
  assert.deepEqual(resultado.map((r) => r.ic).sort(), ["Ic A", "Ic B"]);
});

test("buildPorIc soma custoTotal e conta preventiva/corretiva por tipo", () => {
  const chamados = [
    chamado({ Chave: 1, tipo: "Preventiva" }),
    chamado({ Chave: 2, tipo: "Corretiva" }),
    chamado({ Chave: 3, tipo: "Corretiva" }),
  ];
  const historicoMap = new Map([
    [1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: 100 }],
    [2, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: 50 }],
    [3, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }],
  ]);

  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.preventiva, 1);
  assert.equal(resultado.corretiva, 2);
  assert.equal(resultado.custoTotal, 150);
});

test("buildPorIc separa custo em aprovado/pendente/reprovado — reprovado não entra no custoTotal", () => {
  const chamados = [
    chamado({ Chave: 1, NomeStatus: "Resolvido" }),
    chamado({ Chave: 2, NomeStatus: "Aguardando Aprovação" }),
    chamado({ Chave: 3, NomeStatus: "Orçamento Reprovado" }),
  ];
  const historicoMap = new Map([
    [1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: 100 }],
    [2, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: 200 }],
    [3, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: 570 }],
  ]);

  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.custoAprovado, 100);
  assert.equal(resultado.custoPendente, 200);
  assert.equal(resultado.custoReprovado, 570);
  // custoTotal é a exposição financeira real (aprovado + pendente) — reprovado nunca foi
  // gasto, então não pode aparecer aqui, senão o equipamento parece ter custado mais do que
  // realmente custou.
  assert.equal(resultado.custoTotal, 300);
});

test("buildPorIc calcula recorrenciaDias como o intervalo médio entre datas consecutivas", () => {
  const chamados = [
    chamado({ Chave: 1, DataCriacao: "2026-08-01" }),
    chamado({ Chave: 2, DataCriacao: "2026-08-11" }),
    chamado({ Chave: 3, DataCriacao: "2026-08-21" }),
  ];
  const historicoMap = new Map([
    [1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }],
    [2, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }],
    [3, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }],
  ]);

  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.recorrenciaDias, 10);
});

test("buildPorIc retorna recorrenciaDias null com só 1 chamado", () => {
  const chamados = [chamado({ Chave: 1 })];
  const historicoMap = new Map([[1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }]]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.recorrenciaDias, null);
});

test("buildPorIc usa o cliente mais frequente do histórico do Ic", () => {
  const chamados = [
    chamado({ Chave: 1, cliente: "Loja A" }),
    chamado({ Chave: 2, cliente: "Loja A" }),
    chamado({ Chave: 3, cliente: "Loja B" }),
  ];
  const historicoMap = new Map([
    [1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }],
    [2, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }],
    [3, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }],
  ]);

  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.cliente, "Loja A");
});

test("buildPorIc retorna cliente null quando nenhum chamado tem cliente identificado", () => {
  const chamados = [chamado({ Chave: 1, cliente: null })];
  const historicoMap = new Map([[1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }]]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.cliente, null);
});

test("buildPorIc leva o status atual de cada chamado pro histórico do Ic", () => {
  const chamados = [chamado({ Chave: 1, NomeStatus: "Aguardando Aprovação" })];
  const historicoMap = new Map([[1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }]]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.chamados[0].status, "Aguardando Aprovação");
});

test("buildPorIc calcula mttfHoras como a média das diferenças de horímetro entre Corretivas", () => {
  const chamados = [
    chamado({ Chave: 1, tipo: "Corretiva", DataCriacao: "2026-08-01" }),
    chamado({ Chave: 2, tipo: "Corretiva", DataCriacao: "2026-08-05" }),
    chamado({ Chave: 3, tipo: "Corretiva", DataCriacao: "2026-08-10" }),
  ];
  const historicoMap = new Map([
    [1, { ics: ["Ic A"], horimetro: "1000", causa: null, valorAprovacao: null }],
    [2, { ics: ["Ic A"], horimetro: "1050", causa: null, valorAprovacao: null }],
    [3, { ics: ["Ic A"], horimetro: "1120", causa: null, valorAprovacao: null }],
  ]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.mttfHoras, 60);
});

test("buildPorIc descarta leitura de horímetro decrescente sem quebrar o delta seguinte", () => {
  const chamados = [
    chamado({ Chave: 1, tipo: "Corretiva", DataCriacao: "2026-08-01" }),
    chamado({ Chave: 2, tipo: "Corretiva", DataCriacao: "2026-08-05" }),
    chamado({ Chave: 3, tipo: "Corretiva", DataCriacao: "2026-08-10" }),
  ];
  const historicoMap = new Map([
    [1, { ics: ["Ic A"], horimetro: "1000", causa: null, valorAprovacao: null }],
    [2, { ics: ["Ic A"], horimetro: "900", causa: null, valorAprovacao: null }],
    [3, { ics: ["Ic A"], horimetro: "1080", causa: null, valorAprovacao: null }],
  ]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.mttfHoras, 80);
});

test("buildPorIc retorna mttfHoras null com menos de 2 leituras válidas", () => {
  const chamados = [chamado({ Chave: 1, tipo: "Corretiva" })];
  const historicoMap = new Map([[1, { ics: ["Ic A"], horimetro: "1000", causa: null, valorAprovacao: null }]]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.mttfHoras, null);
});

test("buildPorIc ignora chamados que não são Corretiva no cálculo de mttfHoras", () => {
  const chamados = [
    chamado({ Chave: 1, tipo: "Preventiva", DataCriacao: "2026-08-01" }),
    chamado({ Chave: 2, tipo: "Preventiva", DataCriacao: "2026-08-05" }),
  ];
  const historicoMap = new Map([
    [1, { ics: ["Ic A"], horimetro: "1000", causa: null, valorAprovacao: null }],
    [2, { ics: ["Ic A"], horimetro: "1050", causa: null, valorAprovacao: null }],
  ]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.mttfHoras, null);
});

test("buildPorIc calcula mttrHoras como a média do tempo de reparo das Corretivas finalizadas", () => {
  const chamados = [
    chamado({
      Chave: 1,
      tipo: "Corretiva",
      DataCriacao: "2026-08-01",
      HoraCriacao: "08:00:00",
      DataFinalizacao: "2026-08-01",
      HoraFinalizacao: "12:00:00",
    }),
    chamado({
      Chave: 2,
      tipo: "Corretiva",
      DataCriacao: "2026-08-02",
      HoraCriacao: "08:00:00",
      DataFinalizacao: "2026-08-02",
      HoraFinalizacao: "20:00:00",
    }),
  ];
  const historicoMap = new Map([
    [1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }],
    [2, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }],
  ]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.mttrHoras, 8);
});

test("buildPorIc ignora Corretiva não finalizada no cálculo de mttrHoras", () => {
  const chamados = [chamado({ Chave: 1, tipo: "Corretiva", DataFinalizacao: null })];
  const historicoMap = new Map([[1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }]]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.mttrHoras, null);
  assert.equal(resultado.mttrAguardandoPecaHoras, null);
  assert.equal(resultado.mttrReparoHoras, null);
});

test("buildPorIc retorna mttrHoras null sem nenhuma Corretiva finalizada", () => {
  const chamados = [chamado({ Chave: 1, tipo: "Preventiva" })];
  const historicoMap = new Map([[1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }]]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.mttrHoras, null);
  assert.equal(resultado.mttrAguardandoPecaHoras, null);
  assert.equal(resultado.mttrReparoHoras, null);
});

test("buildPorIc decompõe mttrHoras em espera de peça x reparo", () => {
  const chamados = [
    chamado({
      Chave: 1,
      tipo: "Corretiva",
      DataCriacao: "2026-08-01",
      HoraCriacao: "08:00:00",
      DataFinalizacao: "2026-08-03",
      HoraFinalizacao: "08:00:00",
    }),
  ];
  const historicoMap = new Map([
    [1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null, tempoAguardandoPecaDias: 1 }],
  ]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  // total: 48h (2 dias). 1 dia (24h) esperando peça, 24h de reparo.
  assert.equal(resultado.mttrHoras, 48);
  assert.equal(resultado.mttrAguardandoPecaHoras, 24);
  assert.equal(resultado.mttrReparoHoras, 24);
});

test("buildPorIc limita mttrAguardandoPecaHoras ao total do chamado (proteção contra inconsistência)", () => {
  const chamados = [
    chamado({
      Chave: 1,
      tipo: "Corretiva",
      DataCriacao: "2026-08-01",
      HoraCriacao: "08:00:00",
      DataFinalizacao: "2026-08-01",
      HoraFinalizacao: "12:00:00",
    }),
  ];
  const historicoMap = new Map([
    // tempoAguardandoPecaDias (10 dias = 240h) muito maior que o total do chamado (4h) — dado
    // inconsistente, mas não pode gerar reparoHoras negativo.
    [1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null, tempoAguardandoPecaDias: 10 }],
  ]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.mttrHoras, 4);
  assert.equal(resultado.mttrAguardandoPecaHoras, 4);
  assert.equal(resultado.mttrReparoHoras, 0);
});

test("buildPorIc soma tempoAguardandoPecaDiasTotal entre chamados de tipos diferentes", () => {
  const chamados = [
    chamado({ Chave: 1, tipo: "Corretiva" }),
    chamado({ Chave: 2, tipo: "Preventiva" }),
  ];
  const historicoMap = new Map([
    [1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null, tempoAguardandoPecaDias: 3 }],
    [2, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null, tempoAguardandoPecaDias: 1.5 }],
  ]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.tempoAguardandoPecaDiasTotal, 4.5);
});

test("buildPorIc retorna tempoAguardandoPecaDiasTotal 0 sem nenhuma ocorrência", () => {
  const chamados = [chamado({ Chave: 1 })];
  const historicoMap = new Map([[1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }]]);
  const [resultado] = buildPorIc(chamados, historicoMap);
  assert.equal(resultado.tempoAguardandoPecaDiasTotal, 0);
});

test("buildPorIc ordena por total desc", () => {
  const chamados = [
    chamado({ Chave: 1 }),
    chamado({ Chave: 2 }),
    chamado({ Chave: 3 }),
  ];
  const historicoMap = new Map([
    [1, { ics: ["Ic A"], horimetro: null, causa: null, valorAprovacao: null }],
    [2, { ics: ["Ic B"], horimetro: null, causa: null, valorAprovacao: null }],
    [3, { ics: ["Ic B"], horimetro: null, causa: null, valorAprovacao: null }],
  ]);
  const resultado = buildPorIc(chamados, historicoMap);
  assert.equal(resultado[0].ic, "Ic B");
  assert.equal(resultado[0].total, 2);
});
