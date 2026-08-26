import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSubCategoriaIndex } from "./subcategorias.js";
import { buildClientePorUsuario, buildCodigoClientePorUsuario } from "./usuarios.js";
import { enriquecerChamados, anexarSlaNivel } from "./enriquecimento.js";

const SUBCATEGORIA_INDEX = buildSubCategoriaIndex([
  { Sequencia: "005705", SubCategoria: "Bebedouro", Categoria: "Manutenção - Equipamentos" },
  { Sequencia: "005759", SubCategoria: "Acessiilidade", Categoria: "Sesmt - Solicitações" },
]);

const CLIENTE_POR_USUARIO = buildClientePorUsuario([{ Chave: 586, Cliente: "PORTO SEGURO", CodigoCliente: 36 }]);
const CODIGO_CLIENTE_POR_USUARIO = buildCodigoClientePorUsuario([{ Chave: 586, CodigoCliente: 36 }]);
const UF_POR_CODIGO_CLIENTE = new Map([[36, "BA"]]);

test("enriquece chamado em escopo com taxonomia e cliente", () => {
  const chamados = [
    { Chave: 6544, SequenciaSubCategoria: "005705", ChaveUsuario: 586, Assunto: "Bebedouro quebrado" },
  ];

  const resultado = enriquecerChamados(chamados, {
    subCategoriaIndex: SUBCATEGORIA_INDEX,
    clientePorUsuario: CLIENTE_POR_USUARIO,
    codigoClientePorUsuario: CODIGO_CLIENTE_POR_USUARIO,
    ufPorCodigoCliente: UF_POR_CODIGO_CLIENTE,
  });

  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].Chave, 6544);
  assert.equal(resultado[0].Assunto, "Bebedouro quebrado");
  assert.equal(resultado[0].especialidade, "Manutenção");
  assert.equal(resultado[0].tipo, "Corretiva");
  assert.equal(resultado[0].equipamento, "Bebedouro");
  assert.equal(resultado[0].cliente, "PORTO SEGURO");
  assert.equal(resultado[0].uf, "BA");
});

test("descarta chamado fora de escopo (Sesmt)", () => {
  const chamados = [{ Chave: 1, SequenciaSubCategoria: "005759", ChaveUsuario: 586 }];

  const resultado = enriquecerChamados(chamados, {
    subCategoriaIndex: SUBCATEGORIA_INDEX,
    clientePorUsuario: CLIENTE_POR_USUARIO,
    codigoClientePorUsuario: CODIGO_CLIENTE_POR_USUARIO,
    ufPorCodigoCliente: UF_POR_CODIGO_CLIENTE,
  });

  assert.equal(resultado.length, 0);
});

test("cliente fica null quando ChaveUsuario não está no mapa", () => {
  const chamados = [{ Chave: 2, SequenciaSubCategoria: "005705", ChaveUsuario: 9999 }];

  const resultado = enriquecerChamados(chamados, {
    subCategoriaIndex: SUBCATEGORIA_INDEX,
    clientePorUsuario: CLIENTE_POR_USUARIO,
    codigoClientePorUsuario: CODIGO_CLIENTE_POR_USUARIO,
    ufPorCodigoCliente: UF_POR_CODIGO_CLIENTE,
  });

  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].cliente, null);
  assert.equal(resultado[0].uf, null);
});

test("anexa slaNivel e slaNivelLabel a partir de NomePrioridade", () => {
  const chamados = [
    { Chave: 6544, SequenciaSubCategoria: "005705", ChaveUsuario: 586, NomePrioridade: "1 - Muito Alta" },
  ];

  const resultado = enriquecerChamados(chamados, {
    subCategoriaIndex: SUBCATEGORIA_INDEX,
    clientePorUsuario: CLIENTE_POR_USUARIO,
    codigoClientePorUsuario: CODIGO_CLIENTE_POR_USUARIO,
    ufPorCodigoCliente: UF_POR_CODIGO_CLIENTE,
  });

  assert.equal(resultado[0].slaNivel, 1);
  assert.equal(resultado[0].slaNivelLabel, "Muito Alta");
});

test("anexarSlaNivel anexa slaNivel/slaNivelLabel sem exigir enriquecimento completo", () => {
  const chamados = [{ Chave: 1, NomePrioridade: "3 - Moderada" }, { Chave: 2, NomePrioridade: null }];
  const resultado = anexarSlaNivel(chamados);

  assert.equal(resultado[0].slaNivel, 3);
  assert.equal(resultado[0].slaNivelLabel, "Moderada");
  assert.equal(resultado[1].slaNivel, null);
  assert.equal(resultado[1].Chave, 2);
});

test("enriquecerChamados anexa o nome do solicitante a partir de nomePorUsuario", () => {
  const chamados = [
    { Chave: 1, SequenciaSubCategoria: "005705", ChaveUsuario: 586, NomePrioridade: "1 - Muito Alta" },
  ];

  const [enriquecido] = enriquecerChamados(chamados, {
    subCategoriaIndex: SUBCATEGORIA_INDEX,
    clientePorUsuario: CLIENTE_POR_USUARIO,
    codigoClientePorUsuario: CODIGO_CLIENTE_POR_USUARIO,
    ufPorCodigoCliente: UF_POR_CODIGO_CLIENTE,
    nomePorUsuario: new Map([[586, "Jose Carlos"]]),
  });

  assert.equal(enriquecido.solicitante, "Jose Carlos");
});

test("solicitante fica null quando nomePorUsuario não é fornecido", () => {
  const chamados = [{ Chave: 2, SequenciaSubCategoria: "005705", ChaveUsuario: 586 }];

  const [enriquecido] = enriquecerChamados(chamados, {
    subCategoriaIndex: SUBCATEGORIA_INDEX,
    clientePorUsuario: CLIENTE_POR_USUARIO,
    codigoClientePorUsuario: CODIGO_CLIENTE_POR_USUARIO,
    ufPorCodigoCliente: UF_POR_CODIGO_CLIENTE,
  });

  assert.equal(enriquecido.solicitante, null);
});
