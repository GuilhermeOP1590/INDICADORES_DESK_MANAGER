import { getSupabaseClient } from "./supabaseClient.js";

const CHAVE = "chamados-prioritarios";

const PADRAO = { chamados: [] };

// Cache em memória populado por inicializar() na subida do servidor. Leitura fica síncrona
// (usada inclusive como valor default de parâmetro em outros módulos), então não pode
// depender de round-trip de rede a cada chamada — ver contexto da task no PR.
let cacheConfig = null;

export async function inicializar() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("app_config").select("payload").eq("key", CHAVE).maybeSingle();

  if (error) throw error;

  cacheConfig = data?.payload ?? PADRAO;
  return cacheConfig;
}

export function lerPrioridades() {
  return cacheConfig ?? PADRAO;
}

export async function salvarPrioridades(config) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("app_config")
    .upsert({ key: CHAVE, payload: config, updated_at: new Date().toISOString() });

  if (error) throw error;

  cacheConfig = config;
  return config;
}

// Upsert por codChamado (trim) — se já existe, só atualiza a nota (mantém adicionadoEm
// original); se não existe, adiciona no fim. Pura (não toca em disco) pra poder testar sem
// depender do arquivo real.
export function aplicarUpsert(config, codChamado, nota) {
  const codigo = codChamado.trim();
  const existente = config.chamados.find((c) => c.codChamado === codigo);

  if (existente) {
    return {
      chamados: config.chamados.map((c) => (c.codChamado === codigo ? { ...c, nota: nota ?? "" } : c)),
    };
  }

  return {
    chamados: [...config.chamados, { codChamado: codigo, nota: nota ?? "", adicionadoEm: new Date().toISOString() }],
  };
}

export function aplicarRemocao(config, codChamado) {
  return { chamados: config.chamados.filter((c) => c.codChamado !== codChamado.trim()) };
}

export async function adicionarOuAtualizarPrioridade(codChamado, nota) {
  return salvarPrioridades(aplicarUpsert(lerPrioridades(), codChamado, nota));
}

export async function removerPrioridade(codChamado) {
  return salvarPrioridades(aplicarRemocao(lerPrioridades(), codChamado));
}
