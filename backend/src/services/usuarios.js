import { deskPost } from "./deskApi.js";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h — cadastro de usuários muda raramente

let cache = { clientePorUsuario: null, fetchedAt: 0 };

export function buildClientePorUsuario(list) {
  const mapa = new Map();
  for (const usuario of list) {
    if (usuario.Chave === undefined || usuario.Chave === null) continue;
    mapa.set(usuario.Chave, usuario.Cliente ?? null);
  }
  return mapa;
}

export async function fetchUsuarios({ forceRefresh = false } = {}) {
  const isStale = Date.now() - cache.fetchedAt > CACHE_TTL_MS;

  if (!cache.clientePorUsuario || isStale || forceRefresh) {
    const result = await deskPost("/Usuarios/lista", {});
    cache = {
      clientePorUsuario: buildClientePorUsuario(result.root ?? []),
      fetchedAt: Date.now(),
    };
  }

  return cache.clientePorUsuario;
}
