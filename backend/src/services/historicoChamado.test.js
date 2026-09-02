import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extrairIcs,
  extrairHorimetro,
  extrairNomeEmpresa,
  extrairTempoAguardandoPecaDias,
  extrairDataDecisao,
  ttlPara,
} from "./historicoChamado.js";

test("ttlPara usa um TTL bem mais longo pra chamado finalizado do que pra chamado aberto", () => {
  assert.equal(ttlPara(false), 15 * 60 * 1000);
  assert.equal(ttlPara(true), 30 * 24 * 60 * 60 * 1000);
  assert.ok(ttlPara(true) > ttlPara(false));
});

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

test("extrairNomeEmpresa pega o nome do fornecedor da interação que tem _19465 preenchido", () => {
  const interacoes = [{ Status: [{ text: "Orçamento Reprovado" }] }, { _19465: "EMPILHA EMPILHADEIRAS" }];
  assert.equal(extrairNomeEmpresa(interacoes), "EMPILHA EMPILHADEIRAS");
});

test("extrairNomeEmpresa retorna null quando nenhuma interação tem _19465", () => {
  const interacoes = [{ Status: [{ text: "Resolvido" }] }];
  assert.equal(extrairNomeEmpresa(interacoes), null);
});

test("extrairTempoAguardandoPecaDias soma um período fechado (entrou e saiu)", () => {
  const interacoes = [
    { Status: [{ text: "Em Andamento" }], DataAcao: "05-08-2026" },
    { Status: [{ text: "Aguardando Peça do Estoque" }], DataAcao: "01-08-2026" },
  ];
  assert.equal(extrairTempoAguardandoPecaDias(interacoes), 4);
});

test("extrairTempoAguardandoPecaDias funde Aguardando Peça do Estoque + Peça Enviada para Loja como um único período", () => {
  const interacoes = [
    { Status: [{ text: "Resolvido" }], DataAcao: "10-08-2026" },
    { Status: [{ text: "Peça Enviada para Loja" }], DataAcao: "03-08-2026" },
    { Status: [{ text: "Aguardando Peça do Estoque" }], DataAcao: "01-08-2026" },
  ];
  assert.equal(extrairTempoAguardandoPecaDias(interacoes), 9);
});

test("extrairTempoAguardandoPecaDias conta até agora quando o período ainda não fechou", () => {
  const doisDiasAtras = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const dataBR = `${String(doisDiasAtras.getDate()).padStart(2, "0")}-${String(doisDiasAtras.getMonth() + 1).padStart(2, "0")}-${doisDiasAtras.getFullYear()}`;
  const interacoes = [{ Status: [{ text: "Aguardando Peça do Estoque" }], DataAcao: dataBR }];
  const resultado = extrairTempoAguardandoPecaDias(interacoes);
  assert.ok(resultado >= 1 && resultado <= 3, `esperado ~2 dias, veio ${resultado}`);
});

test("extrairTempoAguardandoPecaDias retorna 0 sem nenhuma ocorrência", () => {
  const interacoes = [{ Status: [{ text: "Resolvido" }], DataAcao: "10-08-2026" }];
  assert.equal(extrairTempoAguardandoPecaDias(interacoes), 0);
});

test("extrairTempoAguardandoPecaDias soma dois períodos separados no mesmo histórico", () => {
  const interacoes = [
    { Status: [{ text: "Resolvido" }], DataAcao: "20-08-2026" },
    { Status: [{ text: "Aguardando Peça do Estoque" }], DataAcao: "18-08-2026" },
    { Status: [{ text: "Em Andamento" }], DataAcao: "10-08-2026" },
    { Status: [{ text: "Aguardando Peça do Estoque" }], DataAcao: "05-08-2026" },
  ];
  assert.equal(extrairTempoAguardandoPecaDias(interacoes), 7);
});

test("extrairTempoAguardandoPecaDias ignora interações sem DataAcao", () => {
  const interacoes = [
    { Status: [{ text: "Aguardando Peça do Estoque" }] },
    { Status: [{ text: "Resolvido" }], DataAcao: "10-08-2026" },
  ];
  assert.equal(extrairTempoAguardandoPecaDias(interacoes), 0);
});

test("extrairDataDecisao pega a data da primeira interação após sair de Aguardando Aprovação", () => {
  const interacoes = [
    { Status: [{ text: "Orçamento Reprovado" }], DataAcao: "03-09-2026" },
    { Status: [{ text: "Aguardando Aprovação" }], DataAcao: "28-08-2026" },
    { Status: [{ text: "Aberto" }], DataAcao: "20-08-2026" },
  ];
  assert.equal(extrairDataDecisao(interacoes), "2026-09-03");
});

test("extrairDataDecisao funciona igual pra aprovado (não filtra por status final, só pela transição)", () => {
  const interacoes = [
    { Status: [{ text: "Aprovado" }], DataAcao: "05-09-2026" },
    { Status: [{ text: "Aguardando Aprovação" }], DataAcao: "01-09-2026" },
  ];
  assert.equal(extrairDataDecisao(interacoes), "2026-09-05");
});

test("extrairDataDecisao ignora status intermediários que não sejam Aguardando Aprovação", () => {
  const interacoes = [
    { Status: [{ text: "Finalizado" }], DataAcao: "10-09-2026" },
    { Status: [{ text: "Em Execução" }], DataAcao: "06-09-2026" },
    { Status: [{ text: "Aprovado" }], DataAcao: "05-09-2026" },
    { Status: [{ text: "Aguardando Aprovação" }], DataAcao: "01-09-2026" },
  ];
  assert.equal(extrairDataDecisao(interacoes), "2026-09-05");
});

test("extrairDataDecisao retorna null quando o chamado nunca passou por Aguardando Aprovação", () => {
  const interacoes = [{ Status: [{ text: "Finalizado" }], DataAcao: "10-09-2026" }];
  assert.equal(extrairDataDecisao(interacoes), null);
});

test("extrairDataDecisao retorna null quando o chamado ainda está Aguardando Aprovação (não decidido)", () => {
  const interacoes = [
    { Status: [{ text: "Aguardando Aprovação" }], DataAcao: "01-09-2026" },
    { Status: [{ text: "Aberto" }], DataAcao: "20-08-2026" },
  ];
  assert.equal(extrairDataDecisao(interacoes), null);
});
