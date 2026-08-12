import { deskPost } from "./deskApi.js";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h — cadastro de usuários muda raramente

let cache = { lista: null, fetchedAt: 0 };
let emVoo = null;

async function getListaUsuarios({ forceRefresh = false } = {}) {
  const isStale = Date.now() - cache.fetchedAt > CACHE_TTL_MS;
  if (cache.lista && !isStale && !forceRefresh) return cache.lista;

  // Evita duas requisições concorrentes a /Usuarios/lista quando fetchUsuarios e
  // fetchCodigoClientePorUsuario são chamados juntos (Promise.all) com cache frio.
  if (!emVoo) {
    emVoo = deskPost("/Usuarios/lista", {})
      .then((result) => {
        cache = { lista: result.root ?? [], fetchedAt: Date.now() };
        emVoo = null;
        return cache.lista;
      })
      .catch((erro) => {
        emVoo = null;
        throw erro;
      });
  }
  return emVoo;
}

export function buildClientePorUsuario(list) {
  const mapa = new Map();
  for (const usuario of list) {
    if (usuario.Chave === undefined || usuario.Chave === null) continue;
    mapa.set(usuario.Chave, usuario.Cliente ?? null);
  }
  return mapa;
}

// CodigoCliente é a Chave em Clientes/lista — usado para juntar o UF do cliente
// (ver clientesUf.js) a cada chamado via ChaveUsuario. Validado com dados reais em 2026-08-11.
export function buildCodigoClientePorUsuario(list) {
  const mapa = new Map();
  for (const usuario of list) {
    if (usuario.Chave === undefined || usuario.Chave === null) continue;
    mapa.set(usuario.Chave, usuario.CodigoCliente ?? null);
  }
  return mapa;
}

export async function fetchUsuarios(opts = {}) {
  return buildClientePorUsuario(await getListaUsuarios(opts));
}

export async function fetchCodigoClientePorUsuario(opts = {}) {
  return buildCodigoClientePorUsuario(await getListaUsuarios(opts));
}
