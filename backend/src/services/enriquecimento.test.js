import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSubCategoriaIndex } from "./subcategorias.js";
import { buildClientePorUsuario, buildCodigoClientePorUsuario } from "./usuarios.js";
import { enriquecerChamados } from "./enriquecimento.js";

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
