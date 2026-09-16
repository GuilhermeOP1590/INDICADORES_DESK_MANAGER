import { test } from "node:test";
import assert from "node:assert/strict";
import { resolverAtribuicaoEfetiva, buildIndicadorPorGrupo, buildIndicadorPorPessoa } from "./pcmAtribuicoes.js";

const grupoDaPessoaFn = (pessoa) => (pessoa === "Nadson da Conceição" ? "Manutenção" : null);

test("resolverAtribuicaoEfetiva usa a atribuição do PCM quando existe", () => {
  const chamado = { distribuicaoSistema: "Nadson da Conceição" };
  const atribuicaoPcm = {
    grupo: "Engenharia",
    pessoa: "Lucas",
    urgencia: "Alta",
    observacao: "aguardando peça",
    dataPrevistaSolucao: "2026-09-20",
  };

  const resultado = resolverAtribuicaoEfetiva(chamado, atribuicaoPcm, grupoDaPessoaFn);

  assert.equal(resultado.origem, "pcm");
  assert.equal(resultado.pessoa, "Lucas");
  assert.equal(resultado.grupo, "Engenharia");
  assert.equal(resultado.urgencia, "Alta");
  assert.equal(resultado.dataPrevistaSolucao, "2026-09-20");
});

test("resolverAtribuicaoEfetiva usa a distribuição do sistema quando não há atribuição do PCM", () => {
  const chamado = { distribuicaoSistema: "Nadson da Conceição" };

  const resultado = resolverAtribuicaoEfetiva(chamado, null, grupoDaPessoaFn);

  assert.equal(resultado.origem, "sistema");
  assert.equal(resultado.pessoa, "Nadson da Conceição");
  assert.equal(resultado.grupo, "Manutenção");
  assert.equal(resultado.urgencia, null);
});

test("resolverAtribuicaoEfetiva cai em 'Sem grupo definido' quando a pessoa do sistema ainda não foi mapeada", () => {
  const chamado = { distribuicaoSistema: "Pessoa Desconhecida" };

  const resultado = resolverAtribuicaoEfetiva(chamado, null, grupoDaPessoaFn);

  assert.equal(resultado.grupo, "Sem grupo definido");
});

test("resolverAtribuicaoEfetiva cai em 'Sem grupo definido' quando o chamado não tem operador", () => {
  const chamado = { distribuicaoSistema: null };

  const resultado = resolverAtribuicaoEfetiva(chamado, null, grupoDaPessoaFn);

  assert.equal(resultado.pessoa, null);
  assert.equal(resultado.grupo, "Sem grupo definido");
});

test("buildIndicadorPorGrupo agrupa por grupo, soma total, pessoas distintas e por urgência", () => {
  const linhas = [
    { grupo: "Manutenção", pessoa: "Guilherme", urgencia: "Alta" },
    { grupo: "Manutenção", pessoa: "Guilherme", urgencia: "Média" },
    { grupo: "Manutenção", pessoa: "Fernanda", urgencia: null },
    { grupo: "Engenharia", pessoa: "Lucas", urgencia: "Crítica" },
  ];

  const resultado = buildIndicadorPorGrupo(linhas);
  const manutencao = resultado.find((g) => g.grupo === "Manutenção");
  const engenharia = resultado.find((g) => g.grupo === "Engenharia");

  assert.equal(manutencao.total, 3);
  assert.equal(manutencao.totalPessoas, 2);
  assert.equal(manutencao.porUrgencia["Alta"], 1);
  assert.equal(manutencao.porUrgencia["Média"], 1);
  assert.equal(manutencao.porUrgencia["Não classificado"], 1);
  assert.equal(engenharia.total, 1);
});

test("buildIndicadorPorPessoa filtra por grupo e agrupa por pessoa", () => {
  const linhas = [
    { grupo: "Manutenção", pessoa: "Guilherme", urgencia: "Alta" },
    { grupo: "Manutenção", pessoa: "Guilherme", urgencia: "Baixa" },
    { grupo: "Manutenção", pessoa: "Fernanda", urgencia: "Alta" },
    { grupo: "Engenharia", pessoa: "Lucas", urgencia: "Crítica" },
  ];

  const resultado = buildIndicadorPorPessoa(linhas, "Manutenção");
  const guilherme = resultado.find((p) => p.pessoa === "Guilherme");

  assert.equal(resultado.length, 2);
  assert.equal(guilherme.total, 2);
  assert.equal(guilherme.porUrgencia["Alta"], 1);
  assert.equal(guilherme.porUrgencia["Baixa"], 1);
});
