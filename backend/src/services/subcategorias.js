import { deskPost } from "./deskApi.js";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h — árvore de categorias muda raramente

let cache = { index: null, fetchedAt: 0 };

export function buildSubCategoriaIndex(list) {
  const index = new Map();
  for (const item of list) {
    if (!item.Sequencia) continue;
    index.set(item.Sequencia, item);
  }
  return index;
}

export async function fetchSubCategorias({ forceRefresh = false } = {}) {
  const isStale = Date.now() - cache.fetchedAt > CACHE_TTL_MS;

  if (!cache.index || isStale || forceRefresh) {
    const result = await deskPost("/SubCategorias/lista", {});
    cache = {
      index: buildSubCategoriaIndex(result.root ?? []),
      fetchedAt: Date.now(),
    };
  }

  return cache.index;
}
