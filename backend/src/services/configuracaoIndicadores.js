import { getSupabaseClient } from "./supabaseClient.js";

const CHAVE = "configuracao-indicadores";

// Derivado da distribuição real de status observada em 2026-08-11 (ver Obsidian).
// "Aguardando Aprovação" fica fora de aberto/concluído de propósito — não pode contar negativamente
// enquanto o orçamento não é avaliado.
const PADRAO = {
  statusConcluido: ["Resolvido", "Recebido/Entregue"],
  statusAguardandoAprovacao: ["Aguardando Aprovação"],
  statusAberto: [
    "Aguardando Atendimento",
    "Em Andamento",
    "Em Atendimento",
    "Pendente",
    "Transferência de Chamado",
    "Aguardando Peça do Estoque",
    "Peça Enviada para Loja",
    "Aguardando Cliente",
    "Aguardando Devolução",
    "Aguardando Fornecedor",
  ],
  // Nomes de status cadastrados manualmente em Configurações > Status, antes de aparecerem em
  // qualquer chamado carregado — só serve pra manter a linha visível/editável na tela com
  // antecedência. Não é usado por classificarStatus (que já trata qualquer status desconhecido
  // como "outro" por padrão); é puro metadado de exibição.
  statusExtrasConhecidos: [],
};

// Cache em memória populado por inicializar() na subida do servidor. Leitura fica síncrona
// (usada inclusive como valor default de parâmetro em outros módulos), então não pode
// depender de round-trip de rede a cada chamada — ver contexto da task no PR.
let cacheConfig = null;

export async function inicializar() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("app_config").select("payload").eq("key", CHAVE).maybeSingle();

  if (error) throw error;

  cacheConfig = data?.payload ? { ...PADRAO, ...data.payload } : PADRAO;
  return cacheConfig;
}

export function lerConfiguracao() {
  return cacheConfig ?? PADRAO;
}

export async function salvarConfiguracao(config) {
  const novaConfig = {
    statusConcluido: config.statusConcluido ?? PADRAO.statusConcluido,
    statusAguardandoAprovacao: config.statusAguardandoAprovacao ?? PADRAO.statusAguardandoAprovacao,
    statusAberto: config.statusAberto ?? PADRAO.statusAberto,
    statusExtrasConhecidos: config.statusExtrasConhecidos ?? PADRAO.statusExtrasConhecidos,
  };

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("app_config")
    .upsert({ key: CHAVE, payload: novaConfig, updated_at: new Date().toISOString() });

  if (error) throw error;

  cacheConfig = novaConfig;
  return novaConfig;
}

export function classificarStatus(status, config = lerConfiguracao()) {
  if (config.statusConcluido.includes(status)) return "concluido";
  if (config.statusAguardandoAprovacao.includes(status)) return "aguardandoAprovacao";
  if (config.statusAberto.includes(status)) return "aberto";
  return "outro";
}
