import { deskPost } from "./deskApi.js";

// UF só existe no detalhe individual do cliente (TCliente.Uf), não em Clientes/lista —
// por isso o N+1. Validado com dados reais em 2026-08-11: 34 clientes, ~3s pra buscar todos
// em paralelo. Cache longo porque endereço de cliente muda raramente.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

let cache = { ufPorCodigoCliente: null, fetchedAt: 0 };
let emVoo = null;

async function carregarUfPorCodigoCliente() {
  const lista = (await deskPost("/Clientes/lista", {})).root ?? [];
  const detalhes = await Promise.all(
    lista.map((cliente) => deskPost("/Clientes", { Chave: cliente.Chave }).catch(() => null))
  );

  const mapa = new Map();
  lista.forEach((cliente, indice) => {
    mapa.set(cliente.Chave, detalhes[indice]?.TCliente?.Uf || null);
  });
  return mapa;
}

export async function fetchUfPorCodigoCliente({ forceRefresh = false } = {}) {
  const isStale = Date.now() - cache.fetchedAt > CACHE_TTL_MS;
  if (cache.ufPorCodigoCliente && !isStale && !forceRefresh) return cache.ufPorCodigoCliente;

  if (!emVoo) {
    emVoo = carregarUfPorCodigoCliente()
      .then((mapa) => {
        cache = { ufPorCodigoCliente: mapa, fetchedAt: Date.now() };
        emVoo = null;
        return mapa;
      })
      .catch((erro) => {
        emVoo = null;
        throw erro;
      });
  }
  return emVoo;
}
