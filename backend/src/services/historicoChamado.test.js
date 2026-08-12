import { test } from "node:test";
import assert from "node:assert/strict";
import { extrairIcs, extrairHorimetro } from "./historicoChamado.js";

test("extrairIcs retorna o Ic de uma única interação", () => {
  const interacoes = [{ ICs: "300 - MTZ - Empilhadeira 06" }];
  assert.deepEqual(extrairIcs(interacoes), ["300 - MTZ - Empilhadeira 06"]);
});

test("extrairIcs junta Ics de interações diferentes, sem duplicar", () => {
  const interacoes = [
    { ICs: "300 - MTZ - Empilhadeira 06" },
    { ICs: "300 - MTZ - Empilhadeira 06" },
    { ICs: "23 - BAR - Ar-Condicionado 12000 BTUs 01" },
  ];
  assert.deepEqual(extrairIcs(interacoes), ["300 - MTZ - Empilhadeira 06", "23 - BAR - Ar-Condicionado 12000 BTUs 01"]);
});

test("extrairIcs separa múltiplos Ics na mesma interação (vírgula ou ponto-e-vírgula)", () => {
  const interacoes = [{ ICs: "300 - MTZ - Empilhadeira 06, 300 - MTZ - Empilhadeira 07" }];
  assert.deepEqual(extrairIcs(interacoes), ["300 - MTZ - Empilhadeira 06", "300 - MTZ - Empilhadeira 07"]);
});

test("extrairIcs retorna array vazio quando nenhuma interação tem ICs", () => {
  const interacoes = [{ Status: [{ text: "Resolvido" }] }, { ICs: "" }];
  assert.deepEqual(extrairIcs(interacoes), []);
});

test("extrairHorimetro pega o valor da interação mais recente que tem _9293 preenchido", () => {
  const interacoes = [{ _9293: "1001" }, { _9293: "950" }];
  assert.equal(extrairHorimetro(interacoes), "1001");
});

test("extrairHorimetro pula interações sem _9293 até achar uma preenchida", () => {
  const interacoes = [{ Status: [{ text: "Aberto" }] }, { _9293: "950" }];
  assert.equal(extrairHorimetro(interacoes), "950");
});

test("extrairHorimetro retorna null quando nenhuma interação tem _9293", () => {
  const interacoes = [{ Status: [{ text: "Resolvido" }] }];
  assert.equal(extrairHorimetro(interacoes), null);
});
