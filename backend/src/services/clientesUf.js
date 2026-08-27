import { deskPost } from "./deskApi.js";

// UF só existe no detalhe individual do cliente (TCliente.Uf), não em Clientes/lista —
// por isso o N+1. Validado com dados reais em 2026-08-11: 34 clientes, ~3s pra buscar todos
// em paralelo. Cache longo porque endereço de cliente muda raramente.
//
// RazaoSocial (nome da empresa/franqueado dono da loja, ex: "MULTICOM ATACADO E VAREJO S/A")
// já vem direto em Clientes/lista — sem custo de N+1, diferente do Uf. "Cliente" no resto do
// app é o Fantasia (nome da loja, ex: "NOVA SERRANA"); RazaoSocial é uma dimensão à parte,
// útil quando várias lojas pertencem à mesma empresa/CNPJ. Validado com dados reais em
// 2026-08-27 (ver script de inspeção descartado na mesma sessão).
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

let cache = { ufPorCodigoCliente: null, empresaPorCodigoCliente: null, fetchedAt: 0 };
let emVoo = null;

async function carregarDadosCliente() {
  const lista = (await deskPost("/Clientes/lista", {})).root ?? [];
  const detalhes = await Promise.all(
    lista.map((cliente) => deskPost("/Clientes", { Chave: cliente.Chave }).catch(() => null))
  );

  const ufPorCodigoCliente = new Map();
  const empresaPorCodigoCliente = new Map();
  lista.forEach((cliente, indice) => {
    ufPorCodigoCliente.set(cliente.Chave, detalhes[indice]?.TCliente?.Uf || null);
    empresaPorCodigoCliente.set(cliente.Chave, cliente.RazaoSocial || null);
  });
  return { ufPorCodigoCliente, empresaPorCodigoCliente };
}

async function garantirCache({ forceRefresh = false } = {}) {
  const isStale = Date.now() - cache.fetchedAt > CACHE_TTL_MS;
  if (cache.ufPorCodigoCliente && !isStale && !forceRefresh) return cache;

  if (!emVoo) {
    emVoo = carregarDadosCliente()
      .then(({ ufPorCodigoCliente, empresaPorCodigoCliente }) => {
        cache = { ufPorCodigoCliente, empresaPorCodigoCliente, fetchedAt: Date.now() };
        emVoo = null;
        return cache;
      })
      .catch((erro) => {
        emVoo = null;
        throw erro;
      });
  }
  return emVoo;
}

export async function fetchUfPorCodigoCliente(opts = {}) {
  return (await garantirCache(opts)).ufPorCodigoCliente;
}

export async function fetchEmpresaPorCodigoCliente(opts = {}) {
  return (await garantirCache(opts)).empresaPorCodigoCliente;
}
