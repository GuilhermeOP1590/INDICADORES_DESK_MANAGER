// backend/src/services/slaNivel.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSlaNivel, buildPorNivel } from "./slaNivel.js";

test("parseSlaNivel extrai nível e label de 'N - Nome'", () => {
  assert.deepEqual(parseSlaNivel("1 - Muito Alta"), { slaNivel: 1, slaNivelLabel: "Muito Alta" });
  assert.deepEqual(parseSlaNivel("4 - Baixa"), { slaNivel: 4, slaNivelLabel: "Baixa" });
  assert.deepEqual(parseSlaNivel("5 - Planejada"), { slaNivel: 5, slaNivelLabel: "Planejada" });
});

test("parseSlaNivel tolera espaços extras ao redor do hífen", () => {
  assert.deepEqual(parseSlaNivel("2   -   Alta"), { slaNivel: 2, slaNivelLabel: "Alta" });
});

test("parseSlaNivel retorna nulos pra valor vazio, nulo ou fora do formato esperado", () => {
  assert.deepEqual(parseSlaNivel(null), { slaNivel: null, slaNivelLabel: null });
  assert.deepEqual(parseSlaNivel(undefined), { slaNivel: null, slaNivelLabel: null });
  assert.deepEqual(parseSlaNivel(""), { slaNivel: null, slaNivelLabel: null });
  assert.deepEqual(parseSlaNivel("Sem prioridade"), { slaNivel: null, slaNivelLabel: null });
});

test("buildPorNivel agrupa por nível, soma abertos/fechados/percentualResolucao e ordena por nível crescente", () => {
  const chamados = [
    { slaNivel: 2, slaNivelLabel: "Alta", NomeStatus: "Resolvido" },
    { slaNivel: 1, slaNivelLabel: "Muito Alta", NomeStatus: "Aguardando Atendimento" },
    { slaNivel: 1, slaNivelLabel: "Muito Alta", NomeStatus: "Resolvido" },
    { slaNivel: null, slaNivelLabel: null, NomeStatus: "Resolvido" },
  ];

  const resultado = buildPorNivel(chamados);

  assert.equal(resultado.length, 2);
  assert.equal(resultado[0].nivel, 1);
  assert.equal(resultado[0].label, "Muito Alta");
  assert.equal(resultado[0].total, 2);
  assert.equal(resultado[0].abertos, 1);
  assert.equal(resultado[0].fechados, 1);
  assert.equal(resultado[0].percentualResolucao, 50);
  assert.equal(resultado[1].nivel, 2);
  assert.equal(resultado[1].total, 1);
});

test("buildPorNivel ignora chamados sem slaNivel", () => {
  const chamados = [{ slaNivel: null, slaNivelLabel: null, NomeStatus: "Resolvido" }];
  assert.deepEqual(buildPorNivel(chamados), []);
});
