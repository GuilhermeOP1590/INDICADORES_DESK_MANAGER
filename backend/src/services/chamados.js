import { deskPost } from "./deskApi.js";

let cache = { data: null, fetchedAt: 0 };
const CACHE_TTL_MS = 5 * 60 * 1000;

// A API pagina em blocos de até 3000 registros. "Tatual" define a partir de
// qual linha exibir (offset), então seguimos buscando até cobrir o "total".
async function fetchAllChamados() {
  let all = [];
  let total = Infinity;

  while (all.length < total) {
    const body = all.length > 0 ? { Tatual: String(all.length) } : {};
    const result = await deskPost("/ChamadosSuporte/lista", body);
    const page = result.root ?? [];
    total = Number(result.total ?? all.length);

    if (page.length === 0) break;
    all = all.concat(page);
  }

  return { data: all, total };
}

export async function fetchChamados({ forceRefresh = false } = {}) {
  const isStale = Date.now() - cache.fetchedAt > CACHE_TTL_MS;

  if (!cache.data || isStale || forceRefresh) {
    const { data, total } = await fetchAllChamados();
    cache = { data, total, fetchedAt: Date.now() };
  }

  return cache;
}
