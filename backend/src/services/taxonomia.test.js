import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSubCategoriaIndex } from "./subcategorias.js";
import { classificarChamado } from "./taxonomia.js";

const SUBCATEGORIAS_REAIS = [
  { Sequencia: "005705", SubCategoria: "Bebedouro", Categoria: "Manutenção - Equipamentos" },
  { Sequencia: "005653", SubCategoria: "Preventiva - Empilhadeira", Categoria: "Manutenção - Equipamentos" },
  { Sequencia: "005898", SubCategoria: "Rotinas - Carrinho de compras", Categoria: "Manutenção - Equipamentos" },
  { Sequencia: "005743", SubCategoria: "Sesmt - Documentação", Categoria: "Manutenção - Equipamentos" },
  { Sequencia: "005646", SubCategoria: "TESTE-DUPLO", Categoria: "Manutenção - Equipamentos" },
  { Sequencia: "005901", SubCategoria: "Outros", Categoria: "Manutenção - Equipamentos" },
  { Sequencia: "005902", SubCategoria: "Segurança - Bases dos porta palets", Categoria: "Manutenção - Equipamentos" },
  { Sequencia: "005907", SubCategoria: "Demandas - Administrativas", Categoria: "Manutenção - Rotinas" },
  { Sequencia: "005529", SubCategoria: "Disjuntor desarmando", Categoria: "Engenharia - Elétrica" },
  { Sequencia: "005759", SubCategoria: "Acessiilidade", Categoria: "Sesmt - Solicitações" },
];

const INDEX = buildSubCategoriaIndex(SUBCATEGORIAS_REAIS);

test("equipamento sem prefixo é Corretiva", () => {
  const resultado = classificarChamado({ SequenciaSubCategoria: "005705" }, INDEX);
  assert.deepEqual(resultado, {
    especialidade: "Manutenção",
    tipo: "Corretiva",
    tipoAtividade: null,
    equipamento: "Bebedouro",
  });
});

test('prefixo "Preventiva - " vira tipo Preventiva e extrai o equipamento', () => {
  const resultado = classificarChamado({ SequenciaSubCategoria: "005653" }, INDEX);
  assert.deepEqual(resultado, {
    especialidade: "Manutenção",
    tipo: "Preventiva",
    tipoAtividade: null,
    equipamento: "Empilhadeira",
  });
});

test('prefixo "Rotinas - " vira tipo Rotina e extrai o equipamento', () => {
  const resultado = classificarChamado({ SequenciaSubCategoria: "005898" }, INDEX);
  assert.deepEqual(resultado, {
    especialidade: "Manutenção",
    tipo: "Rotina",
    tipoAtividade: null,
    equipamento: "Carrinho de compras",
  });
});

test('Categoria "Manutenção - Rotinas" é sempre tipo Rotina, mesmo sem prefixo', () => {
  const resultado = classificarChamado({ SequenciaSubCategoria: "005907" }, INDEX);
  assert.deepEqual(resultado, {
    especialidade: "Manutenção",
    tipo: "Rotina",
    tipoAtividade: null,
    equipamento: "Demandas - Administrativas",
  });
});

test('subcategoria "Sesmt - " dentro de Equipamentos cai em Outros/Não classificado', () => {
  const resultado = classificarChamado({ SequenciaSubCategoria: "005743" }, INDEX);
  assert.equal(resultado.tipo, "Outros/Não classificado");
  assert.equal(resultado.equipamento, "Sesmt - Documentação");
});

test('"TESTE-DUPLO" cai em Outros/Não classificado', () => {
  const resultado = classificarChamado({ SequenciaSubCategoria: "005646" }, INDEX);
  assert.equal(resultado.tipo, "Outros/Não classificado");
});

test('"Outros" é tipo Corretiva (equipamento "Outros")', () => {
  const resultado = classificarChamado({ SequenciaSubCategoria: "005901" }, INDEX);
  assert.equal(resultado.tipo, "Corretiva");
  assert.equal(resultado.equipamento, "Outros");
});

test('prefixo "Segurança - " vira tipo Segurança e extrai o equipamento', () => {
  const resultado = classificarChamado({ SequenciaSubCategoria: "005902" }, INDEX);
  assert.deepEqual(resultado, {
    especialidade: "Manutenção",
    tipo: "Segurança",
    tipoAtividade: null,
    equipamento: "Bases dos porta palets",
  });
});

test("Engenharia usa a Categoria como tipoAtividade, tipo sempre Corretiva", () => {
  const resultado = classificarChamado({ SequenciaSubCategoria: "005529" }, INDEX);
  assert.deepEqual(resultado, {
    especialidade: "Engenharia",
    tipo: "Corretiva",
    tipoAtividade: "Elétrica",
    equipamento: null,
  });
});

test("especialidade fora de escopo (Sesmt) retorna null", () => {
  const resultado = classificarChamado({ SequenciaSubCategoria: "005759" }, INDEX);
  assert.equal(resultado, null);
});

test("SequenciaSubCategoria desconhecida retorna null", () => {
  const resultado = classificarChamado({ SequenciaSubCategoria: "999999" }, INDEX);
  assert.equal(resultado, null);
});
