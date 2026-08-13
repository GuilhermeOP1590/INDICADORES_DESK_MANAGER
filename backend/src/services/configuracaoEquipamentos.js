import { getSupabaseClient } from "./supabaseClient.js";

const CHAVE = "configuracao-equipamentos";

// Semente construída em 2026-08-12 revisando a distribuição real dos 89 valores de
// `equipamento` observados no período completo (ver
// docs/superpowers/specs/2026-08-12-classificacao-equipamentos-design.md pro racional de
// cada grupo). Chaves já normalizadas (trim + minúsculo + espaços colapsados) — ver
// normalizarEquipamento abaixo.
const PADRAO = {
  grupos: ["Movimentação", "Refrigeração", "Energia", "Climatização", "Portas", "Limpeza e Operação", "Estruturas"],
  atribuicoes: {
    // Movimentação
    "empilhadeira": "Movimentação",
    "carrinho de compras": "Movimentação",
    "agua de bateria de empilhadeira": "Movimentação",
    "funcionamento de carregador de baterias": "Movimentação",
    "berço de bateria e carrinho de troca": "Movimentação",
    "paleteira": "Movimentação",
    "transpaleteira": "Movimentação",
    "suporte de bateria": "Movimentação",
    "rampas das docas": "Movimentação",
    // Estruturas
    "porta pallets": "Estruturas",
    "bases dos porta palets": "Estruturas",
    // Refrigeração
    "funcionamento portas de camara de congelado": "Refrigeração",
    "funcionamento portas de camara de resfriado": "Refrigeração",
    "funcionamento balcoes de acougue": "Refrigeração",
    "funcionamento ilhas de congelados": "Refrigeração",
    "iluminação de balcao de resfriado vertical": "Refrigeração",
    "iluminação de ilha de congelado": "Refrigeração",
    "iluminação do balcao de acougue": "Refrigeração",
    "balcao de acougue": "Refrigeração",
    "balcao de refrigeraçao": "Refrigeração",
    "camara de congelado": "Refrigeração",
    "camara de resfriado": "Refrigeração",
    "açougue/deposito açougue": "Refrigeração",
    "balcão de açougue": "Refrigeração",
    "ilhas de congelado e resfriado": "Refrigeração",
    "ilhas de congelados - reparos": "Refrigeração",
    "freezer horizontal": "Refrigeração",
    "funcionamento casa de maquinas": "Refrigeração",
    "casa de maquinas": "Refrigeração",
    "casa de máquinas": "Refrigeração",
    "bebedouro": "Refrigeração",
    "porta de anti-camara": "Refrigeração",
    "porta de resfriado - vedação ruim": "Refrigeração",
    "porta de resfriado - suporte danificado": "Refrigeração",
    "porta de resfriado - não fecha": "Refrigeração",
    "porta de resfriado - correia danificada": "Refrigeração",
    "porta de congelados - suporte danificado": "Refrigeração",
    "porta de congelados - não fecha": "Refrigeração",
    "porta de congelados - guia danificada": "Refrigeração",
    "porta de congelados - vedação ruim": "Refrigeração",
    // Energia
    "funcionamento gerador": "Energia",
    "tensão de bateria gerador": "Energia",
    "banco de capacitores (substação)": "Energia",
    "gerador": "Energia",
    "gerador - quinzenal": "Energia",
    // Climatização
    "ar condicionado central": "Climatização",
    "climatizadores": "Climatização",
    "ar condicionado de salas": "Climatização",
    "climatizador": "Climatização",
    "climatizador - vazamento de água": "Climatização",
    "ventilador": "Climatização",
    "exaustor": "Climatização",
    "ar condicionado sala do cftv": "Climatização",
    "ar condicionado sala do cpd": "Climatização",
    "ar condicionado transportadora barcelona": "Climatização",
    "ar condicionado cozinha do predio": "Climatização",
    "ar condicionado recepção": "Climatização",
    "ar condicionado sala do transporte rm": "Climatização",
    "ar condicionado sala da logistica (gerencia de projetos)": "Climatização",
    "ar condicionado sala da logistica": "Climatização",
    "ar condicionado sala do transporte": "Climatização",
    "ar condicionado sala da fiscalização": "Climatização",
    "ar condicionado sala de reunião bahia": "Climatização",
    "ar condicionado sala de descanço dos motoristas": "Climatização",
    "ar condicionado portaria (externa)": "Climatização",
    "ar condicionado sala do televendas": "Climatização",
    "ar condicionado sala do ti": "Climatização",
    "ar condicionado rh e sesmt": "Climatização",
    "ar condicionado guarita dos seguranças (externo)": "Climatização",
    // Portas
    "portas rm": "Portas",
    "portões de entrada - quebrado": "Portas",
    "portões de entrada - não funciona": "Portas",
    // Limpeza e Operação
    "funcionamento lavadora de piso": "Limpeza e Operação",
    "lavadora de piso": "Limpeza e Operação",
    "prensa de papelão": "Limpeza e Operação",
    // Sem entrada aqui: chamados administrativos/genéricos (Outros, Demandas -
    // Administrativas, Lojas, Armário de Colaboradores, Administrativas, Geral, Sesmt -
    // Adequação de NR's, Loja Nova, Fiscal - Atividade, Sesmt - Notificação) caem no
    // fallback "Não classificado" de propósito — não são falha de equipamento físico.
  },
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

export function lerConfiguracaoEquipamentos() {
  return cacheConfig ?? PADRAO;
}

export async function salvarConfiguracaoEquipamentos(config) {
  const novaConfig = {
    grupos: config.grupos ?? PADRAO.grupos,
    atribuicoes: config.atribuicoes ?? PADRAO.atribuicoes,
  };

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("app_config")
    .upsert({ key: CHAVE, payload: novaConfig, updated_at: new Date().toISOString() });

  if (error) throw error;

  cacheConfig = novaConfig;
  return novaConfig;
}

export function normalizarEquipamento(texto) {
  return texto.trim().toLowerCase().replace(/\s+/g, " ");
}

export function grupoDoEquipamento(equipamento, config = lerConfiguracaoEquipamentos()) {
  if (!equipamento) return null;
  return config.atribuicoes[normalizarEquipamento(equipamento)] ?? "Não classificado";
}
