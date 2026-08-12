import { createClient } from "@supabase/supabase-js";

let clienteCache = null;

export function getSupabaseClient() {
  if (clienteCache) return clienteCache;

  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Falha rápido e visível aqui — melhor um erro claro na primeira chamada do
  // que um client quebrado se propagando em silêncio por services adiante.
  if (!url || !chave) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY são obrigatórias quando DATA_BACKEND=supabase");
  }

  clienteCache = createClient(url, chave);
  return clienteCache;
}
